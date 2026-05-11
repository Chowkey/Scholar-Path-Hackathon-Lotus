# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

ScholarPath — Next.js 16 (App Router) + TypeScript app for scholarship discovery, AI counseling, profile evaluation, and alumni search. Backed by Supabase (Postgres + pgvector + Auth) and OpenAI. See `ARCHITECTURE.md` for a deep dive; this file is the load-bearing summary.

## Commands

```bash
npm run dev                    # next dev (port 3000)
npm run build                  # production build
npm run start                  # production server
npm run lint                   # ESLint (next/core-web-vitals + next/typescript)

# Data scripts (need OPENAI_API_KEY + SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)
npm run db:seed                # scrape + seed scholarships (idempotent)
npm run db:upload-snapshot     # upload scripts/scholarships-snapshot.json
npm run db:ingest-knowledge    # chunk + embed docs into knowledge_chunks
npx tsx scripts/checkSchema.ts # verify migrations 003/004 are applied
```

There is no test suite. Type-check via `npm run build` (no separate `tsc` script).

## Path alias

`@/*` resolves to repo root (e.g. `@/lib/openai`, `@/components/ui/Button`).

## Three Supabase clients — pick the right one

The split matters because RLS depends on which client you use.

| File | Use from | Auth context |
|------|----------|--------------|
| `lib/supabase/client.ts` | Client components | Cookie-aware (`@supabase/ssr`) — respects RLS as the signed-in user |
| `lib/supabase/server.ts` | Server components / route handlers reading per-user data | Reads Next `cookies()` — respects RLS as the signed-in user |
| `lib/supabase/service.ts` | Admin / scraper / cron writes that legitimately need to bypass RLS | `SUPABASE_SERVICE_ROLE_KEY` — **server-only**, never import from a client component |
| `lib/supabase.ts` | Legacy back-compat shim | Anon key — prefer the explicit clients above |

If you write to a per-user table (`chat_sessions`, `evaluations`, `saved_scholarships`, `user_scholarship_facts`, `profiles`), use the **server** client so the row's `user_id` is enforced by RLS. Reach for **service** only for the scraper, seed scripts, or admin endpoints.

## Auth & route gating

`middleware.ts` runs `updateSession()` on every request matched by its matcher (which excludes `/api/scholarships` and `/api/acceptance-rate` so those stay public).

- Public: `/`, `/scholarships`, `/scholarships/[id]`, `/login`, `/signup`, `/auth/*`
- Authed user: `/counselor/**`, `/evaluator/**`, `/alumni/**`
- Admin (`profiles.is_admin = true`): `/admin/**`

When adding a new gated route, update the `USER_GATED` / `ADMIN_GATED` arrays in `middleware.ts` — the matcher alone does not enforce gating.

## User facts — single source of truth

`user_scholarship_facts` is a per-user key/value store (`PK (user_id, key)`, `value` JSONB) that backs both the chat counselor and the evaluator. **Do not invent new fact keys ad hoc** — they must come from `PROFILE_FACT_KEYS` in `lib/profile-facts.ts`. Both surfaces share the same keys so the evaluator form prefills from chat and the chat prompt sees evaluator inputs.

- Write path (chat): `app/api/chat/route.ts` → `profileToFacts()` → `upsertFacts()`
- Write path (evaluator): `app/api/evaluate/route.ts` → `evaluatorProfileToFacts()` → `upsertFacts()`
- Read path (chat prompt injection): `listFactsAsRecord()` → `formatFactsForPrompt()` → `knownUserFacts` block — model is told not to re-ask
- Read path (evaluator prefill): server component `app/evaluator/page.tsx` → `factsToEvaluatorProfile()` → `initialProfile` prop

`upsertFacts()` pre-fetches existing values and skips byte-equal writes so `updated_at` only moves when something actually changed. `canonicalizeKey()` snake_cases incoming keys to prevent `"GPA"` vs `"gpa"` duplicates.

## Chat turn pipeline (`/api/chat`)

Every turn fires three OpenAI calls. The first runs in parallel with the Supabase reads; the second is sequential because it consumes the facts read.

1. **Parallel** — `extractIntent()` (OpenAI #1, `INTENT_PROMPT` + `INTENT_SCHEMA`, input is `JSON.stringify(messages)`) **+** `loadScholarshipLookup()` (Supabase) **+** `listFactsAsRecord(user)` (Supabase).
2. **Profile extraction** — `extractProfile()` (OpenAI #2, `PROFILE_EXTRACTION_PROMPT` + `PROFILE_SCHEMA`). Input is `{messages, knownUserFacts}`, **not just messages** — the prompt tells the model to treat `knownUserFacts` as settled and never propose a `nextBestQuestion` that re-asks them. This is what forces sequential ordering.
3. In-memory: `buildShortlist()` ranks scholarships against the extracted profile (gated by `intent.shouldUseScholarshipMatching`); `retrieveKnowledge()` keyword-matches `lib/study-abroad-knowledge.ts` chunks (gated by `intent.shouldUseKnowledgeBase`). **Gotcha:** chat reads from the hardcoded TS module, **not** the pgvector `knowledge_chunks` table. The `db:ingest-knowledge` script and migration 002 populate that table, but nothing in `/api/chat` queries it — `lib/rag.ts` / `match_knowledge_chunks` are only used by the ingest pipeline today.
4. **Response generation** (OpenAI #3) — branch on `intent.needsWebSearch`. KB variant `generateKnowledgeResponse` uses `KB_RESPONSE_PROMPT` and sends `{intent, profile, knownUserFacts, localKnowledge, validatedScholarships, recommendationMode}`. Web variant `generateWebFallbackResponse` uses `WEB_RESPONSE_PROMPT`, sends `{latestUserMessage, profile, intent, knownUserFacts, localKnowledge, validatedScholarships, note}`, and additionally enables `tools: [{type: "web_search_preview"}]`. Both return `CHAT_RESPONSE_SCHEMA` (`{phase, assistantMessage, followUpQuestion, recommendedScholarshipIds, nextSteps}`) and cap `max_output_tokens: 1200`.
5. `validateRecommendations()` filters `recommendedScholarshipIds` to the shortlist and downgrades `phase: "recommend"` to `"ask_more"` / `"guide"` if `shouldUseScholarshipMatching && enoughInfoForRecommendations && specificityLevel !== "low"` isn't true.
6. Parallel persist: full thread → `chat_sessions` via `persistTurn()`; profile → `user_scholarship_facts` via `upsertFacts(profileToFacts(...))`.
7. Stream text back via `streamText()`; response carries `X-Session-Id` header so the client can resume.

Tweaking chat behavior usually means editing the prompt constants and schemas inside `app/api/chat/route.ts`, not the orchestration.

## Normalized scholarship schema (migration 004)

Scholarships are split across `countries`, `organizations`, `fields`, `scholarships`, and the m:n `scholarship_fields`. **Never write to these tables directly** — go through `lib/scholarshipNormalizedWriter.ts` (`upsertScholarshipNormalized()`), which:

- upserts country by `name`
- upserts org by `(name, country_id)`
- upserts fields by `name`
- dedupes the scholarship by `(name, organization_id)`
- replaces the `scholarship_fields` link rows

Reads should use `select(SCHOLARSHIP_SELECT)` from `lib/scholarshipTransform.ts` so the joined country / organization / fields come back in one round-trip and map cleanly to the app type.

## Data ingestion knobs

- `SCHOLARSHIP_SCRAPE_PROVIDER` = `interfaze` (default) or `openai` — switches `lib/scholarshipScraper.ts` between Interfaze AI and OpenAI `web_search_preview`
- `SCHOLARSHIPS_PER_SOURCE` caps extracted records per source URL
- `INTERFAZE_MODEL` selects the Interfaze model
- Model overrides: `OPENAI_CHAT_MODEL`, `OPENAI_EVALUATE_MODEL`, `OPENAI_ALUMNI_MODEL`, `OPENAI_EMBEDDING_MODEL`, `OPENAI_SCRAPE_MODEL` (defaults in code, currently `gpt-4o-mini` / `text-embedding-3-small`)

## Required env vars

Core: `OPENAI_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SITE_URL` (must also be added to Supabase → Auth → Redirect URLs for OAuth to work).

Optional features: `EXA_API_KEY` (alumni discovery), `INTERFAZE_API_KEY` (default scraper provider).

## Migrations

`supabase/migrations/` is the source of truth for schema. Apply in order; `npx tsx scripts/checkSchema.ts` verifies the latter two are live.

- `001_scholarships.sql` — original flat `scholarships` table (superseded by 004 but still referenced as the base table)
- `002_knowledge_rag.sql` — `knowledge_documents` + `knowledge_chunks` (pgvector, 1536-dim) + `match_knowledge_chunks` RPC. Populated by `db:ingest-knowledge`; **not currently read by `/api/chat`**.
- `003_user_data.sql` — `profiles`, `chat_sessions`, `evaluations`, `saved_scholarships`, `user_scholarship_facts`. All RLS-gated by `auth.uid() = user_id`. Adds the `handle_new_user` trigger that auto-creates a `profiles` row on signup.
- `004_normalize_scholarships.sql` — splits scholarships into `countries` / `organizations` / `fields` / `scholarships` / `scholarship_fields`. All writes must go through `lib/scholarshipNormalizedWriter.ts`.

## Bootstrapping the first admin

After signup, in the Supabase SQL editor:
```sql
update public.profiles set is_admin = true where email = '<your-email>';
```
