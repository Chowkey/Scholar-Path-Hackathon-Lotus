-- Migration 006: dedup + similar-scholarship recommendations.
--
-- Adds three things the scraper writer needs to avoid duplicates and the app
-- needs to surface "similar scholarships":
--
--   1. pg_trgm for fuzzy name/organization comparison.
--   2. description_embedding vector(1536) on scholarships, populated at
--      scrape/upload time and reused for both dedup and recommendations.
--   3. Two SQL functions:
--      - find_duplicate_scholarship: single round-trip co-signal dedup
--        (exact (name, organization_id) -> link -> fuzzy name+org -> embed+org).
--      - match_similar_scholarships: cosine top-K by description embedding,
--        used by the future "similar scholarships" UI.

create extension if not exists pg_trgm;

alter table public.scholarships
  add column if not exists description_embedding vector(1536);

-- Trigram GIN indexes for fuzzy name / organization comparison.
create index if not exists scholarships_name_trgm_idx
  on public.scholarships using gin (name gin_trgm_ops);

create index if not exists organizations_name_trgm_idx
  on public.organizations using gin (name gin_trgm_ops);

-- Cosine similarity index for description embeddings.
-- ivfflat skips NULL rows automatically, so existing rows pre-backfill are fine.
create index if not exists scholarships_description_embedding_idx
  on public.scholarships using ivfflat (description_embedding vector_cosine_ops)
  with (lists = 100);

-- Helps the link-equality leg of dedup.
create index if not exists scholarships_link_lower_idx
  on public.scholarships (lower(regexp_replace(coalesce(link, ''), '/+$', '')));


-- find_duplicate_scholarship: co-signal dedup with short-circuit precedence.
--
-- Returns at most one row (id, match_reason). Precedence:
--   1. exact (name, organization_id) — matches the existing unique constraint
--   2. link — same scholarship URL (case-insensitive, trailing-slash-insensitive)
--   3. fuzzy_name_org — pg_trgm similarity on name AND organization >= threshold
--   4. embedding_org  — description embedding cosine >= threshold AND
--                       organization fuzzy match >= the lower org threshold
--                       (the co-signal: embedding alone never rejects)
--
-- Pass p_embedding = null to skip the embedding leg (e.g. for rows we couldn't
-- embed). Existing rows whose description_embedding is null are silently
-- ignored by the embedding leg.
create or replace function public.find_duplicate_scholarship(
  p_name text,
  p_org_id uuid,
  p_org_name text,
  p_link text,
  p_embedding vector(1536) default null,
  p_name_trgm_threshold float default 0.65,
  p_org_trgm_threshold float default 0.5,
  p_embed_threshold float default 0.9
) returns table (
  id uuid,
  match_reason text,
  score float
)
language sql stable
as $$
  with normalized_link as (
    select lower(regexp_replace(coalesce(p_link, ''), '/+$', '')) as nl
  ),
  exact_match as (
    select s.id, 'exact_name_org'::text as reason, 1.0::float as score
    from public.scholarships s
    where s.name = p_name and s.organization_id = p_org_id
    limit 1
  ),
  link_match as (
    select s.id, 'link'::text as reason, 1.0::float as score
    from public.scholarships s, normalized_link
    where normalized_link.nl <> ''
      and lower(regexp_replace(coalesce(s.link, ''), '/+$', '')) = normalized_link.nl
    limit 1
  ),
  fuzzy_match as (
    select s.id,
           'fuzzy_name_org'::text as reason,
           (similarity(s.name, p_name) + similarity(o.name, p_org_name)) / 2.0 as score
    from public.scholarships s
    join public.organizations o on o.id = s.organization_id
    where similarity(s.name, p_name) >= p_name_trgm_threshold
      and similarity(o.name, p_org_name) >= p_name_trgm_threshold
    order by score desc
    limit 1
  ),
  embed_match as (
    select s.id,
           'embedding_org'::text as reason,
           1 - (s.description_embedding <=> p_embedding) as score
    from public.scholarships s
    join public.organizations o on o.id = s.organization_id
    where p_embedding is not null
      and s.description_embedding is not null
      and 1 - (s.description_embedding <=> p_embedding) >= p_embed_threshold
      and similarity(o.name, p_org_name) >= p_org_trgm_threshold
    order by s.description_embedding <=> p_embedding
    limit 1
  )
  select id, reason, score from exact_match
  union all
  select id, reason, score from link_match
    where not exists (select 1 from exact_match)
  union all
  select id, reason, score from fuzzy_match
    where not exists (select 1 from exact_match)
      and not exists (select 1 from link_match)
  union all
  select id, reason, score from embed_match
    where not exists (select 1 from exact_match)
      and not exists (select 1 from link_match)
      and not exists (select 1 from fuzzy_match)
  limit 1;
$$;


-- match_similar_scholarships: cosine top-K for the "similar scholarships"
-- recommendation UI. Excludes the query row itself when exclude_id is given.
create or replace function public.match_similar_scholarships(
  query_embedding vector(1536),
  match_count int default 5,
  exclude_id uuid default null,
  min_similarity float default 0.0
) returns table (
  id uuid,
  similarity float
)
language sql stable
as $$
  select s.id, 1 - (s.description_embedding <=> query_embedding) as similarity
  from public.scholarships s
  where s.description_embedding is not null
    and (exclude_id is null or s.id <> exclude_id)
    and 1 - (s.description_embedding <=> query_embedding) >= min_similarity
  order by s.description_embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;


grant execute on function public.find_duplicate_scholarship(
  text, uuid, text, text, vector, float, float, float
) to anon, authenticated, service_role;

grant execute on function public.match_similar_scholarships(
  vector, int, uuid, float
) to anon, authenticated, service_role;
