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
  completed_at timestamptz
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
  type text not null,                    -- 'thought' | 'tool_call' | 'tool_result' | 'memory_recall' | 'final'
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
-- After running this SQL:
-- 1. In Supabase dashboard → Database → Extensions → make sure "vector" is enabled.
-- 2. For embeddings you will call OpenAI text-embedding-3-small (1536 dims).
-- 3. Add TAVILY_API_KEY to your env for the web_search tool.
-- ============================================
