-- Migration 007: convenience RPC for the "similar scholarships" UI.
--
-- match_similar_to_scholarship takes a source scholarship id and returns the
-- top-K most similar rows by description-embedding cosine. Saves the API
-- from fetching the source row's vector and round-tripping it back through
-- match_similar_scholarships — both the lookup and the rank happen in one
-- SQL call.
--
-- Returns an empty set if the source row has no embedding yet (legacy rows
-- pre-006 / pre-backfill).

create or replace function public.match_similar_to_scholarship(
  p_id uuid,
  p_match_count int default 10,
  p_min_similarity float default 0.0
) returns table (
  id uuid,
  similarity float
)
language sql stable
as $$
  with q as (
    select description_embedding as emb
    from public.scholarships
    where id = p_id
      and description_embedding is not null
    limit 1
  )
  select s.id, 1 - (s.description_embedding <=> q.emb) as similarity
  from public.scholarships s, q
  where s.description_embedding is not null
    and s.id <> p_id
    and 1 - (s.description_embedding <=> q.emb) >= p_min_similarity
  order by s.description_embedding <=> q.emb
  limit greatest(p_match_count, 1);
$$;

grant execute on function public.match_similar_to_scholarship(uuid, int, float)
  to anon, authenticated, service_role;
