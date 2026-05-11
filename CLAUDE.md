# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Critical: Next.js version

The repo declares `"next": "^14.2.35"` and uses the App Router, but `AGENTS.md` warns that this build has breaking changes from stock Next.js 14 and that APIs, conventions, and file structure may differ from training-data defaults. **Before writing any Next.js-specific code (route handlers, server actions, config, middleware, dynamic APIs, etc.), read the relevant guide in `node_modules/next/dist/docs/` and honor any deprecation notices you see.** App Router pages and routing live under `node_modules/next/dist/docs/01-app/`; don't assume stock Next.js 14 behavior. If you change this rule, update both `AGENTS.md` (the canonical source) and this file.

## Commands

```bash
npm install
npm run dev            # next dev (http://localhost:3000)
npm run build          # production build
npm run start          # production server
npm run lint           # next lint (ESLint, config: .eslintrc.json → next/core-web-vitals)

# Data / RAG scripts (tsx; need OPENAI_API_KEY + Supabase URL + SUPABASE_SERVICE_ROLE_KEY)
npm run db:seed              # scripts/scholarshipDB.ts — scrape + upsert scholarships
npm run db:upload-snapshot   # scripts/uploadSnapshotToSupabase.ts — push scholarships-snapshot.json
npm run db:ingest-knowledge  # scripts/ingestKnowledgeToSupabase.ts — chunk + embed knowledge for RAG
```

No test suite exists; there is no single-test runner to document.

TypeScript path alias: `@/*` → repo root (see `tsconfig.json`). Import as `@/lib/...`, `@/components/...`, `@/app/...`.

## Architecture

### Top-level layout

- `app/` — App Router pages and API routes. User-facing routes: `/` (landing page in `app/page.tsx` linking to the feature areas below), `/counselor`, `/scholarships`, `/scholarships/[id]`, `/evaluator`, `/alumni`, `/admin`, `/admin/scholarships`, `/admin/imports`. API routes live under `app/api/{chat,evaluate,alumni,scholarships,scholarships/[id],acceptance-rate,acceptance-rate-exa,admin/scholarships}`.
- `components/{chat,evaluator,scholarships,layout,ui}/` — feature-scoped React components. `AppShell` in `components/layout` wraps every page via `app/layout.tsx`.
- `lib/` — shared server/client code: OpenAI + Supabase clients, RAG retrieval, chat helpers, scholarship transform/options, scraper, acceptance-rate lookup, alumni search, in-repo knowledge corpus, types.
- `scripts/` — standalone `tsx` entry points for seeding and ingestion; also contains committed data files (`discovered-sources.json`, `scholarships-snapshot.json`).
- `supabase/migrations/` — hand-maintained SQL: `001_scholarships.sql` (scholarships table + RLS public-read policy + `updated_at` trigger), `002_knowledge_rag.sql` (RAG tables and `match_knowledge_chunks` RPC).
- `data/` — runtime-written local storage (e.g. `data/chat-sessions.json` via `lib/chat-storage.ts`).
- `docs/` — `chatbot-flow.md`, `rag-implementation-plan.md`. `implementation_plan.md` at the root describes the Supabase + Interfaze migration that produced the current shape.

### Data flow and external services

- **OpenAI** is accessed through a lazy singleton in `lib/openai.ts` (`getOpenAIClient()`). The SDK pinned in `package.json` is `openai: ^6.x` — use `openai.responses.create` with `text.format: { type: "json_schema", strict: true }` (see existing routes); do not reach for the older `chat.completions.create` shape from v4-era examples. Model names come from env vars (`OPENAI_CHAT_MODEL`, `OPENAI_EVALUATE_MODEL`, `OPENAI_ALUMNI_MODEL`, `OPENAI_EMBEDDING_MODEL`, `OPENAI_SCRAPE_MODEL`) with hard-coded defaults baked into the call sites — update both the env var and the default when changing models.
- **Supabase** has two clients in `lib/supabase.ts`: `createBrowserClient()` (anon key, RLS-respecting, safe for client code and public reads) and `createServiceClient()` (service role, bypasses RLS, **server/scripts only — never import from a client component**). Scholarship rows go through `lib/scholarshipTransform.ts` (`rowToScholarship`, `ScholarshipRow`) between DB and UI types — don't hand-massage shapes in route handlers, use the transform.
- **RAG** (`lib/rag.ts`): `embedText` → `text-embedding-3-small` by default → `rpc("match_knowledge_chunks", …)` defined in `002_knowledge_rag.sql`. Changes to chunking/retrieval need to be coordinated with the migration.
- **Local KB fallback**: `lib/study-abroad-knowledge.ts` is an in-memory keyword-ranked corpus used by the chat route's `retrieveKnowledge()` as a lightweight alternative to the Supabase RAG path.
- **External providers** (optional, guarded by env vars): Exa (`EXA_API_KEY`) for alumni and acceptance-rate-exa; Interfaze (`INTERFAZE_API_KEY`, `INTERFAZE_MODEL`, `SCHOLARSHIP_SCRAPE_PROVIDER`, `SCHOLARSHIPS_PER_SOURCE`) for scholarship scraping in `lib/scholarshipScraper.ts` and `scripts/scholarshipDB.ts`.

### Counselor chat pipeline (`app/api/chat/route.ts`)

The single POST handler runs a multi-stage pipeline that's easy to break if you edit one stage without the others:

1. **Intent + Profile extraction** (`extractIntent`, `extractProfile`) run in parallel alongside `loadScholarshipLookup()`, each via a separate `responses.create` call with its own strict JSON schema (`INTENT_SCHEMA`, `PROFILE_SCHEMA`).
2. **Shortlist** (`buildShortlist`) — deterministic rule-based scoring over Supabase scholarships, gated on `intent.shouldUseScholarshipMatching`.
3. **Knowledge retrieval** (`retrieveKnowledge`) — keyword scoring over the local corpus, gated on `intent.shouldUseKnowledgeBase`.
4. **Response generation** — `generateWebFallbackResponse` (uses `tools: [{ type: "web_search_preview" }]`) when `intent.needsWebSearch`, else `generateKnowledgeResponse`. Both return `CHAT_RESPONSE_SCHEMA` shape.
5. **Guardrails** (`validateRecommendations`) — downgrades `recommend` phase to `ask_more`/`guide` if the profile is too sparse; whitelists `recommendedScholarshipIds` against the shortlist.
6. **Rendering** (`buildFinalAssistantText`) — emits human-readable Markdown plus a machine-parseable `##ROADMAP## … ##END##` block that `lib/chat.ts → parseRoadmap` consumes on the client. Removing or renaming these markers breaks the roadmap UI.
7. **Persistence** (`saveChatSession`) — appends to `data/chat-sessions.json`.
8. **Streaming** — `streamText` chunks the already-assembled string; the endpoint returns `text/plain` with `Cache-Control: no-store`, it is not a Vercel AI SDK stream.

When adding a new intent, schema field, or recommendation path, update every stage that references it (prompt text, schema, payload shape, validator, renderer) or the strict JSON parsing will throw.

### Scholarship type + transform contract

`lib/types.ts → Scholarship` is the UI-facing shape (singular `degree`, `field`, structured `languageRequirements`). The DB row (`ScholarshipRow` in `lib/scholarshipTransform.ts`) uses snake_case and different field names (`field_of_study`, `academic_requirements`, `language_requirements` as jsonb, etc.). Route handlers must go through `rowToScholarship`; don't assume DB and UI shapes match.

### Env vars

`.env.example` only lists `OPENAI_API_KEY`, `EXA_API_KEY`, `INTERFAZE_API_KEY`, but the code also reads Supabase vars (`NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) plus the OpenAI model overrides listed above. The README's "Environment variables" section is the authoritative list.

## Footguns

- **Counselor chat is not Supabase-optional.** `app/api/chat/route.ts` calls `loadScholarshipLookup()` on every request, which does `db.from("scholarships").select("*")` via `createBrowserClient()`. Without `NEXT_PUBLIC_SUPABASE_URL` (or `SUPABASE_URL`) and `NEXT_PUBLIC_SUPABASE_ANON_KEY`, the route throws before any LLM work. The README's quick-start glosses over this.
- **`data/chat-sessions.json` is committed *and* runtime-mutated.** `lib/chat-storage.ts → saveChatSession` appends to it on every successful chat completion, so it will frequently show up in `git status` after local dev. Don't blanket-stage it (`git add -A` / `git add data/`) unless you actually mean to commit a session log; prefer adding files by name when committing related work.
- **Strict JSON schemas are unforgiving.** The chat pipeline uses `text.format: { type: "json_schema", strict: true }` for intent, profile, and response extraction. Renaming or adding a field in one place (prompt, schema, payload type, validator, renderer) without updating the rest will throw at parse time, not at lint/build.
- **Roadmap markers are load-bearing.** The chat route emits a `##ROADMAP## … ##END##` block that `lib/chat.ts → parseRoadmap` parses on the client; renaming or reformatting the markers silently breaks the roadmap UI without a build error.
