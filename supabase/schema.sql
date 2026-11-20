-- IRON CORE v13.0 // Supabase PostgreSQL Schema
-- Выполни этот SQL в Supabase -> SQL Editor

create table if not exists public.ironcore_backups (
  sync_code text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.ironcore_backups enable row level security;

create policy "Allow read/write by sync_code"
  on public.ironcore_backups
  for all
  using (true)
  with check (true);
