-- 003_user_data.sql
-- Adds per-user tables: profiles, chat_sessions, evaluations, saved_scholarships.
-- Enables RLS so each user sees only their own rows.

-- =====================================================================
-- 1. profiles — extends auth.users with app-level fields
-- =====================================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Auto-create a profile row whenever a new auth.users row appears (signup or OAuth).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =====================================================================
-- 2. chat_sessions — replaces data/chat-sessions.json
-- =====================================================================
create table if not exists public.chat_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  messages jsonb not null default '[]'::jsonb,
  profile jsonb,
  shortlist_ids text[] default '{}',
  recommendations jsonb default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists chat_sessions_user_idx
  on public.chat_sessions (user_id, updated_at desc);

-- =====================================================================
-- 3. evaluations — history of profile-vs-scholarship runs
-- =====================================================================
create table if not exists public.evaluations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  profile jsonb not null,
  scholarship_ids text[] not null,
  results jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists evaluations_user_idx
  on public.evaluations (user_id, created_at desc);

-- =====================================================================
-- 4. saved_scholarships — bookmarks
-- =====================================================================
create table if not exists public.saved_scholarships (
  user_id uuid not null references auth.users(id) on delete cascade,
  scholarship_id text not null references public.scholarships(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, scholarship_id)
);

-- =====================================================================
-- 5. Row-Level Security — every table is private to its owner
-- =====================================================================
alter table public.profiles            enable row level security;
alter table public.chat_sessions       enable row level security;
alter table public.evaluations         enable row level security;
alter table public.saved_scholarships  enable row level security;

drop policy if exists "own profile"      on public.profiles;
drop policy if exists "own sessions"     on public.chat_sessions;
drop policy if exists "own evaluations"  on public.evaluations;
drop policy if exists "own saves"        on public.saved_scholarships;

create policy "own profile"
  on public.profiles            for all
  using  (auth.uid() = id)
  with check (auth.uid() = id);

create policy "own sessions"
  on public.chat_sessions       for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "own evaluations"
  on public.evaluations         for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "own saves"
  on public.saved_scholarships  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);
