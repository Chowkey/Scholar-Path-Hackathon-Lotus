create table if not exists scholarships (
  id           text primary key,
  name         text not null,
  country      text not null default '',
  flag         text not null default '',
  organization text not null,
  degree       text[] not null default '{}',
  funding      text not null check (funding in ('full', 'partial')),
  fields       text[] not null default '{}',
  deadline     text not null,
  description  text not null,
  requirements jsonb not null default '{}',
  link         text not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Trigger to keep updated_at current
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists scholarships_updated_at on scholarships;
create trigger scholarships_updated_at
  before update on scholarships
  for each row execute procedure update_updated_at();

-- Row-Level Security: allow public reads; writes need service role key
alter table scholarships enable row level security;

-- Drop existing policies first to allow re-running this script
drop policy if exists "Public read" on scholarships;
create policy "Public read" on scholarships for select using (true);
