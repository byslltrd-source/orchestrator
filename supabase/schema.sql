-- ============================================
-- Orchestrator - Supabase Schema + RLS (Autonomous Agents + Memory)
-- Run / re-run this in the Supabase SQL Editor when schema changes
-- ============================================

-- Enable extensions
create extension if not exists vector;
create extension if not exists "uuid-ossp";

-- ============================================
-- 1. Profiles (existing, kept for subscriptions + usage)
-- ============================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,

  stripe_customer_id text unique,
  subscription_status text default 'free',
  subscription_plan text default 'free',
  current_period_end timestamptz,

  -- Real-time Vision (expensive premium opt-in feature)
  realtime_vision_consent boolean default false,
  realtime_vision_frames_used integer default 0,

  orchestrations_used integer default 0,
  orchestrations_limit integer default 20,
  usage_reset_date timestamptz default (date_trunc('month', now()) + interval '1 month'),

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Auto profile creation
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;

create policy "Users can view own profile" on public.profiles for select using (auth.uid() = id);
create policy "Users can update own profile (limited)" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

-- updated_at trigger
create or replace function public.handle_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists set_updated_at on public.profiles;
create trigger set_updated_at before update on public.profiles
  for each row execute function public.handle_updated_at();

-- ============================================
-- 2. Long-term Memory (vector enabled) - critical for "run itself"
-- ============================================
create table if not exists public.memories (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid,                    -- optional: memory scoped to a specific goal/task
  content text not null,           -- the fact / observation / preference
  embedding vector(1536),          -- OpenAI text-embedding-3-small (change to 3072 if using large)
  metadata jsonb default '{}',     -- tags, importance, source, etc.
  created_at timestamptz default now()
);

alter table public.memories enable row level security;

create policy "Users can manage their own memories"
  on public.memories for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Fast similarity search (used by the agent to recall relevant memories)
create or replace function public.match_memories(
  query_embedding vector(1536),
  match_user_id uuid,
  match_threshold float default 0.78,
  match_count int default 8,
  filter_task_id uuid default null
)
returns table (
  id uuid,
  content text,
  metadata jsonb,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    m.id,
    m.content,
    m.metadata,
    1 - (m.embedding <=> query_embedding) as similarity
  from public.memories m
  where m.user_id = match_user_id
    and (filter_task_id is null or m.task_id = filter_task_id)
    and 1 - (m.embedding <=> query_embedding) > match_threshold
  order by m.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- ============================================
-- 3. Tasks / Goals (what the user tells the agent to achieve autonomously)
-- ============================================
create table if not exists public.tasks (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  goal text not null,                    -- the high-level objective ("Research X and create a pitch deck")
  status text default 'active',          -- active | paused | completed | failed
  max_steps integer default 12,
  images jsonb default '[]',             -- optional vision references: StoredAsset[] (see lib/supabase/storage.ts) or legacy strings
  metadata jsonb default '{}',           -- e.g. { realtime_vision: true } for expensive opt-in features
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.tasks enable row level security;
create policy "Users manage their own tasks" on public.tasks for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================
-- 4. Agent Runs (one execution of a task - this is what "runs itself")
-- ============================================
create table if not exists public.agent_runs (
  id uuid primary key default uuid_generate_v4(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text default 'running',         -- running | completed | failed | paused_for_approval
  current_step integer default 0,
  final_result text,
  error text,
  started_at timestamptz default now(),
  completed_at timestamptz,
  metadata jsonb default '{}'            -- e.g. { realtime_vision: true }
);

alter table public.agent_runs enable row level security;
create policy "Users view their own runs" on public.agent_runs for select using (auth.uid() = user_id);

-- ============================================
-- 5. Agent Steps (the full trace - this is how YOU and the user "watch" it run itself)
-- ============================================
create table if not exists public.agent_steps (
  id uuid primary key default uuid_generate_v4(),
  run_id uuid not null references public.agent_runs(id) on delete cascade,
  step_number integer not null,
  type text not null,                    -- 'thought' | 'tool_call' | 'tool_result' | 'memory' | 'final' | 'vision_frame' (Premium real-time)
  content text,
  tool_name text,
  tool_args jsonb,
  tool_result text,
  created_at timestamptz default now()
);

alter table public.agent_steps enable row level security;
create policy "Users view steps of their runs" on public.agent_steps for select
  using (exists (select 1 from public.agent_runs r where r.id = run_id and r.user_id = auth.uid()));

-- ============================================
-- 6. Basic indexes for performance
-- ============================================
create index if not exists memories_user_id_idx on public.memories(user_id);
create index if not exists agent_runs_task_id_idx on public.agent_runs(task_id);
create index if not exists agent_steps_run_id_idx on public.agent_steps(run_id);

-- ============================================
-- 7. Usage / Audit History (next layer - tracks every orchestration)
-- ============================================
create table if not exists public.usage_events (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,                    -- 'one-shot' | 'autonomous'
  task text,
  result_preview text,                   -- short summary or first 200 chars
  images_count integer default 0,
  tokens_used integer,                   -- optional future
  created_at timestamptz default now()
);

alter table public.usage_events enable row level security;
create policy "Users view their own usage events" on public.usage_events for select using (auth.uid() = user_id);

create index if not exists usage_events_user_id_idx on public.usage_events(user_id);
create index if not exists usage_events_created_at_idx on public.usage_events(created_at);

-- Note: For production, add a cron or background worker to clean old steps/memories per plan limits.

-- ============================================
-- 8. Tools Registry (for every new tool to be on Supabase)
-- Tools are defined in code (GitHub) but registered here for persistence, discovery,
-- usage tracking, and admin visibility. New tools (including proprietary/orchestra_tool)
-- should be upserted here.
-- ============================================
create table if not exists public.tools (
  id uuid primary key default uuid_generate_v4(),
  name text unique not null,                    -- e.g. 'orchestra_tool', 'policy_translation_engine'
  description text,
  parameters jsonb default '{}',                -- JSON schema for args
  is_proprietary boolean default false,
  tier text default 'pro',                      -- 'free' | 'pro' | 'proprietary_ultra'
  metadata jsonb default '{}',                  -- tags, version, etc.
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.tools enable row level security;
create policy "Anyone can view tools" on public.tools for select using (true);
-- Service role / admin can manage; no user insert for now.

create index if not exists tools_name_idx on public.tools(name);
create index if not exists tools_tier_idx on public.tools(tier);

-- Seed core + new proprietary tools (run this or upsert via code)
insert into public.tools (name, description, is_proprietary, tier, parameters) values
  ('web_search', 'Search the web for up-to-date information.', false, 'pro', '{"type":"object","properties":{"query":{"type":"string"}},"required":["query"]}'),
  ('browse_page', 'Fetch and extract content from a URL.', false, 'pro', '{"type":"object","properties":{"url":{"type":"string"}},"required":["url"]}'),
  ('orchestra_tool', 'The flagship native Orchestra Tool. Chains all proprietary engines for autonomous funding acquisition, opportunity hunting, tailored materials, and action plans.', true, 'proprietary_ultra', '{"type":"object","properties":{"project_summary":{"type":"string"},"funding_goals":{"type":"string"},"preferred_funder_types":{"type":"array"},"max_opportunities":{"type":"number"}},"required":["project_summary"]}'),
  ('policy_translation_engine', 'Translates policy/messaging for different demographic tribes while preserving facts.', true, 'proprietary_ultra', '{"type":"object","properties":{"policy_text":{"type":"string"},"target_audiences":{"type":"array"}},"required":["policy_text","target_audiences"]}'),
  ('constituent_emotion_layering', 'Maps emotional undercurrents across communications/groups/time (privacy-preserving).', true, 'proprietary_ultra', '{"type":"object","properties":{"content":{"type":"string"}}}'),
  ('knowledge_heat_map', 'Scans memory/knowledge base for heating vs cooling topics.', true, 'proprietary_ultra', '{"type":"object","properties":{"focus":{"type":"string"}}}'),
  ('invisible_workflow_weaver', 'Discovers undocumented workflows from digital exhaust and generates shareable playbooks.', true, 'proprietary_ultra', '{"type":"object","properties":{"lookback_days":{"type":"number"}}}'),
  ('opportunity_decay_clock', 'Calculates half-lives and refresh actions for opportunities in memory/context.', true, 'proprietary_ultra', '{"type":"object","properties":{"context":{"type":"string"}}}'),
  ('send_email', 'Write and send context-aware emails (Resend).', false, 'proprietary_ultra', '{"type":"object","properties":{"to":{"type":"string"},"subject":{"type":"string"},"html":{"type":"string"}},"required":["to","subject","html"]}'),
  ('analyze_emotional_state', 'Analyze emotional state from text/vision.', false, 'pro', '{}')
on conflict (name) do update set
  description = excluded.description,
  is_proprietary = excluded.is_proprietary,
  tier = excluded.tier,
  parameters = excluded.parameters,
  updated_at = now();

-- ============================================
-- 9. PROVISO (disciplined workspace) — run supabase/proviso.sql for full tables + tool seed
-- ============================================

-- ============================================
-- After running this SQL:
-- 1. In Supabase dashboard → Database → Extensions → make sure "vector" is enabled.
-- 2. For embeddings you will call OpenAI text-embedding-3-small (1536 dims).
-- 3. Add TAVILY_API_KEY to your env for the web_search tool.
-- ============================================
