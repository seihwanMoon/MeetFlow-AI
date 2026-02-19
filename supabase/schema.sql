-- Supabase schema draft for MeetFlow AI
create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id),
  title text not null,
  scheduled_at timestamptz,
  status text default 'queued',
  created_at timestamptz default now()
);

create table if not exists public.recordings (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  storage_path text not null,
  duration_seconds integer,
  language text,
  status text default 'uploaded',
  transcript_text text,
  created_at timestamptz default now()
);

create table if not exists public.summaries (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  overview text,
  decisions text,
  discussions text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.action_items (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  assignee text,
  due_date date,
  description text,
  confidence numeric,
  status text default 'pending',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.diagrams (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  type text,
  mermaid_source text,
  asset_path text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Basic Row Level Security policies can be added once auth strategy is finalized.
