-- IRON CORE v14.0 // Supabase PostgreSQL Schema (Auth + RLS + Incremental History)
-- Выполни этот SQL в Supabase -> SQL Editor

-- 1. Legacy full backup table (backward compatible with sync_code)
create table if not exists public.ironcore_backups (
  sync_code text primary key,
  user_id uuid references auth.users(id) on delete set null,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.ironcore_backups enable row level security;

drop policy if exists "Allow read/write by sync_code" on public.ironcore_backups;
create policy "Allow owner or sync_code access"
  on public.ironcore_backups
  for all
  using (user_id is null or auth.uid() = user_id)
  with check (user_id is null or auth.uid() = user_id);

-- 2. Normalized workout session history (supports charts & 3D muscle workload history)
create table if not exists public.workout_sessions (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  session_date date not null,
  program_id text not null,
  program_title text not null,
  week integer not null default 1,
  day_title text not null,
  tonnage_kg integer not null default 0,
  completed_sets integer not null default 0,
  total_sets integer not null default 0,
  exercises jsonb not null default '[]'::jsonb,
  muscle_load jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists idx_workout_sessions_user_date
  on public.workout_sessions (user_id, session_date desc);

alter table public.workout_sessions enable row level security;

create policy "Users manage own workout_sessions"
  on public.workout_sessions
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 3. Normalized daily nutrition history
create table if not exists public.nutrition_days (
  user_id uuid not null references auth.users(id) on delete cascade,
  day_date date not null,
  bodyweight numeric(5,2) not null default 78.0,
  day_type text not null default 'workout',
  kcal integer not null default 0,
  protein integer not null default 0,
  fat integer not null default 0,
  carbs integer not null default 0,
  water_ml integer not null default 0,
  entries jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, day_date)
);

alter table public.nutrition_days enable row level security;

create policy "Users manage own nutrition_days"
  on public.nutrition_days
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
