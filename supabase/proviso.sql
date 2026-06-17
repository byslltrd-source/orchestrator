-- ============================================
-- PROVISO — Proprietary Virtual Intelligence & Structured Operations
-- Run after schema.sql in Supabase SQL Editor
-- ============================================

create table if not exists public.proviso_shared_work (
  id uuid primary key default uuid_generate_v4(),
  user_id text not null,
  work_date date not null default current_date,
  title text not null,
  notes text,
  file_path text,
  file_name text,
  file_mime text,
  workflow_tags text[] default '{}',
  created_at timestamptz default now()
);

create index if not exists proviso_shared_user_date_idx
  on public.proviso_shared_work (user_id, work_date desc);

create table if not exists public.proviso_briefcase (
  id uuid primary key default uuid_generate_v4(),
  user_id text not null,
  title text not null,
  file_path text not null,
  file_name text not null,
  file_mime text,
  session_expires_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists proviso_briefcase_one_per_user
  on public.proviso_briefcase (user_id);

create table if not exists public.proviso_vault (
  id uuid primary key default uuid_generate_v4(),
  user_id text not null,
  title text not null,
  ciphertext text not null,
  iv text not null,
  salt text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists proviso_vault_user_idx on public.proviso_vault (user_id);

create table if not exists public.proviso_eod_briefs (
  id uuid primary key default uuid_generate_v4(),
  user_id text not null,
  work_date date not null,
  brief_markdown text not null,
  entry_count integer default 0,
  created_at timestamptz default now(),
  unique (user_id, work_date)
);

create table if not exists public.proviso_permission_grants (
  id uuid primary key default uuid_generate_v4(),
  user_id text not null,
  scope text not null check (scope in ('single_file', 'folder', 'search')),
  target text not null,
  actions text[] not null default '{}',
  expires_at timestamptz not null,
  consumed boolean default false,
  created_at timestamptz default now()
);

create index if not exists proviso_grants_user_idx
  on public.proviso_permission_grants (user_id, expires_at desc);

-- RLS: service role manages; optional owner policies for purchaser deployments
alter table public.proviso_shared_work enable row level security;
alter table public.proviso_briefcase enable row level security;
alter table public.proviso_vault enable row level security;
alter table public.proviso_eod_briefs enable row level security;
alter table public.proviso_permission_grants enable row level security;

-- Tools registry seed
insert into public.tools (name, description, is_proprietary, tier, parameters) values
  (
    'proviso',
    'PROPRIETARY — PROVISO disciplined workspace: Shared Work (agent-assisted), Briefcase (one present-job file), Private Vault (password-encrypted, agent-blocked), EOD briefs, and encrypted permission grants for extended access.',
    true,
    'proprietary_ultra',
    '{"type":"object","properties":{"action":{"type":"string","enum":["read_context","generate_eod","workflow_summary"]},"work_date":{"type":"string"}}}'
  )
on conflict (name) do update set
  description = excluded.description,
  is_proprietary = excluded.is_proprietary,
  tier = excluded.tier,
  parameters = excluded.parameters,
  updated_at = now();