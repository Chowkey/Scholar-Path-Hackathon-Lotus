-- Migration 005: typed funding columns for filterable scholarship matching.
--
-- The existing `funding` text column stays as-is for display ("£3,000
-- stipend"). These new columns hold the normalized form so the matcher can
-- do hard filters (e.g. WHERE funding_kind = 'full_tuition_plus_stipend')
-- without parsing text on every query.
--
-- Populated by:
--   - scripts/applyFundingNormalization.ts (legacy backfill from the
--     funding-normalized.json output of the two-pass classifier)
--   - lib/scholarshipScraper.ts at scrape time, once the prompt update lands

alter table public.scholarships
  add column if not exists funding_kind text,
  add column if not exists funding_amount_value numeric,
  add column if not exists funding_amount_currency text,
  add column if not exists funding_amount_period text;

-- Constrain funding_kind to the taxonomy used by the classifier and the
-- scraper. NULL is allowed for rows that have not been classified yet.
alter table public.scholarships
  drop constraint if exists scholarships_funding_kind_check;
alter table public.scholarships
  add constraint scholarships_funding_kind_check
  check (
    funding_kind is null
    or funding_kind in (
      'full_tuition_plus_stipend',
      'full_tuition_only',
      'partial',
      'stipend_only',
      'allowance',
      'unspecified'
    )
  );

alter table public.scholarships
  drop constraint if exists scholarships_funding_amount_period_check;
alter table public.scholarships
  add constraint scholarships_funding_amount_period_check
  check (
    funding_amount_period is null
    or funding_amount_period in ('per_year', 'per_month', 'one_time', 'none')
  );

-- Filter index for the recommender's hard-filter path.
create index if not exists scholarships_funding_kind_idx
  on public.scholarships (funding_kind);
