-- 001_scholarships.sql
-- WARNING: this script resets the scholarships table and removes old rows.
-- Run in Supabase SQL Editor to initialize the redesigned schema.

drop table if exists scholarships cascade;

create table scholarships (
  id                    text primary key,
  name                  text not null,
  country               text not null,
  flag                  text not null default '',
  organization          text not null,
  degree                text not null,
  funding               text not null,
  field_of_study        text not null,
  academic_requirements text not null default '',
  language_requirements jsonb not null default '{}',
  other_requirements    text not null default '',
  deadline              text not null,
  description           text not null,
  link                  text not null,
  source_name           text not null default '',
  source_url            text not null default '',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index scholarships_country_idx on scholarships (country);
create index scholarships_degree_idx on scholarships (degree);
create index scholarships_deadline_idx on scholarships (deadline);

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

alter table scholarships enable row level security;
drop policy if exists "Public read" on scholarships;
create policy "Public read" on scholarships for select using (true);
