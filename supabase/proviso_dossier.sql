-- PROVISO CIRCL — Dossiers for corporate officers, associates, and organizations
-- Run after supabase/proviso.sql

create table if not exists public.proviso_dossiers (
  id uuid primary key default uuid_generate_v4(),
  user_id text not null,
  subject_type text not null check (subject_type in ('corporate_officer', 'associate', 'organization')),
  full_name text not null,
  aliases text[] default '{}',
  primary_organization text,
  role_title text,
  location text,
  relationship_type text,
  relationship_to_name text,
  context_notes text,
  dossier_markdown text not null default '',
  provenance text[] default '{}',
  parent_dossier_id uuid references public.proviso_dossiers(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists proviso_dossiers_user_type_idx
  on public.proviso_dossiers (user_id, subject_type);

create index if not exists proviso_dossiers_name_idx
  on public.proviso_dossiers (user_id, full_name);

create table if not exists public.proviso_dossier_links (
  id uuid primary key default uuid_generate_v4(),
  user_id text not null,
  from_dossier_id uuid not null references public.proviso_dossiers(id) on delete cascade,
  to_dossier_id uuid not null references public.proviso_dossiers(id) on delete cascade,
  relationship_type text not null,
  notes text,
  created_at timestamptz default now(),
  unique (from_dossier_id, to_dossier_id)
);

create index if not exists proviso_dossier_links_from_idx on public.proviso_dossier_links (from_dossier_id);
create index if not exists proviso_dossier_links_to_idx on public.proviso_dossier_links (to_dossier_id);

alter table public.proviso_dossiers enable row level security;
alter table public.proviso_dossier_links enable row level security;

insert into public.tools (name, description, is_proprietary, tier, parameters) values
  (
    'proviso_circl',
    'PROPRIETARY — PROVISO CIRCL (Corporate & Relational Intelligence Context Layer). Create dossiers on corporate officers, associates, and organizations. Map associate rings and network dossiers from public OSINT.',
    true,
    'proprietary_ultra',
    '{"type":"object","properties":{"action":{"type":"string","enum":["create_dossier","list_dossiers","get_network","link_subjects"]},"subject_type":{"type":"string","enum":["corporate_officer","associate","organization"]},"full_name":{"type":"string"},"parent_dossier_id":{"type":"string"},"relationship_type":{"type":"string"}},"required":["action"]}'
  )
on conflict (name) do update set
  description = excluded.description,
  is_proprietary = excluded.is_proprietary,
  tier = excluded.tier,
  parameters = excluded.parameters,
  updated_at = now();