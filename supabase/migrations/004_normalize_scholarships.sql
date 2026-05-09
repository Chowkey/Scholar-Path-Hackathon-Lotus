-- 004_normalize_scholarships.sql
-- Splits the denormalized public.scholarships table into countries / organizations / fields
-- + a many-to-many link table. Recreates saved_scholarships with a uuid FK.
-- Adds public.user_scholarship_facts: a (user_id, key) keyed JSONB store the AI
-- writes to during chat to remember study-abroad-relevant details about each user.
--
-- DESTRUCTIVE: drops the existing scholarships and saved_scholarships tables.
-- Re-run `npm run db:upload-snapshot` (or db:seed) afterward to repopulate.

-- =====================================================================
-- 0. Drop old denormalized tables (data is wiped on purpose)
-- =====================================================================
drop table if exists public.saved_scholarships cascade;
drop table if exists public.scholarships cascade;

-- =====================================================================
-- 1. Lookup tables
-- =====================================================================
create table public.countries (
  id       uuid primary key default gen_random_uuid(),
  name     text not null unique,
  flag_url text not null default ''
);

create table public.organizations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  country_id uuid references public.countries(id) on delete set null,
  unique (name, country_id)
);
create index organizations_country_idx on public.organizations(country_id);

create table public.fields (
  id   uuid primary key default gen_random_uuid(),
  name text not null unique
);

-- =====================================================================
-- 2. Scholarships (uuid PK, normalized FKs)
-- =====================================================================
create table public.scholarships (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  country_id      uuid not null references public.countries(id),
  organization_id uuid not null references public.organizations(id),
  degree          text not null,
  funding         text not null,
  deadline        text not null,
  description     text not null,
  requirements    jsonb not null default '{}'::jsonb,
  link            text not null,
  source_name     text,
  source_url      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (name, organization_id)
);
create index scholarships_country_idx       on public.scholarships(country_id);
create index scholarships_organization_idx  on public.scholarships(organization_id);
create index scholarships_created_at_idx    on public.scholarships(created_at desc);

-- requirements jsonb shape (free-form, but writers should follow this):
-- {
--   "academic":  "...",
--   "language":  { "ielts": "6.5", "toefl": "80", "pte": null, "duolingo": null, "other": [] },
--   "other":     "..."
-- }

-- =====================================================================
-- 3. Many-to-many link: scholarship_fields
-- =====================================================================
create table public.scholarship_fields (
  scholarship_id uuid not null references public.scholarships(id) on delete cascade,
  field_id       uuid not null references public.fields(id)       on delete cascade,
  primary key (scholarship_id, field_id)
);
create index scholarship_fields_field_idx on public.scholarship_fields(field_id);

-- =====================================================================
-- 4. RLS — public read, writes via service role
-- =====================================================================
alter table public.countries          enable row level security;
alter table public.organizations      enable row level security;
alter table public.fields             enable row level security;
alter table public.scholarships       enable row level security;
alter table public.scholarship_fields enable row level security;

create policy "public read countries"          on public.countries          for select using (true);
create policy "public read organizations"      on public.organizations      for select using (true);
create policy "public read fields"             on public.fields             for select using (true);
create policy "public read scholarships"       on public.scholarships       for select using (true);
create policy "public read scholarship_fields" on public.scholarship_fields for select using (true);

-- =====================================================================
-- 5. saved_scholarships (recreated with uuid FK)
-- =====================================================================
create table public.saved_scholarships (
  user_id        uuid not null references auth.users(id)         on delete cascade,
  scholarship_id uuid not null references public.scholarships(id) on delete cascade,
  created_at     timestamptz not null default now(),
  primary key (user_id, scholarship_id)
);
alter table public.saved_scholarships enable row level security;
create policy "own saves" on public.saved_scholarships for all
  using      (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- =====================================================================
-- 6. user_scholarship_facts — AI-managed key/value memory per user
-- =====================================================================
-- Composite PK on (user_id, key) guarantees one row per fact per user.
-- The application normalizes keys to snake_case before writing, and the
-- helper compares the new value to the existing one to skip no-op updates.
create table public.user_scholarship_facts (
  user_id    uuid not null references auth.users(id) on delete cascade,
  key        text not null,
  value      jsonb not null,
  source     text,                   -- e.g. "chat:<session_id>", "manual", "evaluator"
  confidence real,                   -- 0..1, optional
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);
create index user_scholarship_facts_user_idx
  on public.user_scholarship_facts(user_id, updated_at desc);

alter table public.user_scholarship_facts enable row level security;
create policy "own facts" on public.user_scholarship_facts for all
  using      (auth.uid() = user_id)
  with check (auth.uid() = user_id);
