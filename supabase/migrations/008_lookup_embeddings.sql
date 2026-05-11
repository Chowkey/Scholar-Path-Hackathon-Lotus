-- Migration 008: lookup-table embeddings for the RAG-style recommender.
--
-- The counselor's "Recommend scholarships" path needs to soft-filter against
-- (a) the user's preferred field of study and (b) the user's preferred
-- university+country combo. Doing those comparisons against raw text would
-- miss "Computer Science" ≈ "Applied CS" or "Oxford" ≈ "University of Oxford".
--
-- We attach a 1536-dim embedding to each lookup row (NOT to each scholarship —
-- one organization can back many scholarships, so per-org is the natural unit)
-- and compare cosine similarity inside the recommendation query.
--
-- Embedding texts (computed by scripts + scrape pipeline):
--   organizations.embedding_org_country = embed("{org_name} in {country_name}")
--   fields.embedding_field              = embed("{field_name}")
--
-- Populated by:
--   - scripts/backfillLookupEmbeddings.ts (one-shot for existing rows)
--   - lib/scholarshipScraper.ts at scrape time (new rows + missing embeddings)

alter table public.organizations
  add column if not exists embedding_org_country vector(1536);

alter table public.fields
  add column if not exists embedding_field vector(1536);

-- ivfflat cosine indexes skip NULL rows, so existing rows pre-backfill are
-- fine. Lists tuned for low cardinality — organizations and fields are small
-- tables compared to scholarships.
create index if not exists organizations_embedding_org_country_idx
  on public.organizations using ivfflat (embedding_org_country vector_cosine_ops)
  with (lists = 50);

create index if not exists fields_embedding_field_idx
  on public.fields using ivfflat (embedding_field vector_cosine_ops)
  with (lists = 25);
