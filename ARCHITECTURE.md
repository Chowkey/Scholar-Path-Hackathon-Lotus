# ScholarPath — Architecture Overview

## What It Is

ScholarPath is an AI-powered scholarship discovery and planning platform for Southeast Asian students. It combines a guided counselor chatbot, scholarship matching, profile evaluation, and alumni discovery into a single Next.js application.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 (App Router), TypeScript 5 |
| Styling | Tailwind CSS, Lucide React |
| AI | OpenAI SDK (GPT-4o-mini, embeddings, web search) |
| Web Search | Exa.js (alumni discovery) |
| Scraping | Interfaze AI (scholarship ingestion) |
| Database | Supabase (PostgreSQL + pgvector) |
| Auth | Supabase Auth (`@supabase/ssr`) — email/password + Google OAuth |
| Markdown | react-markdown, remark-gfm |

---

## Project Structure

```
/
├── middleware.ts               # Session refresh + route gating
├── app/                        # Next.js App Router
│   ├── page.tsx                # Landing page
│   ├── login/, signup/         # Auth pages (email + Google OAuth)
│   ├── auth/callback/          # OAuth code exchange
│   ├── auth/signout/           # Sign-out POST
│   ├── counselor/              # AI chat counselor
│   │   ├── page.tsx            # Past-sessions list
│   │   ├── new/                # New chat
│   │   └── [sessionId]/        # Resume specific chat
│   ├── scholarships/           # Browse, detail, saved
│   │   ├── page.tsx            # Directory + Saved-only toggle
│   │   ├── saved/              # Bookmarked-only listing
│   │   └── [id]/               # Detail page
│   ├── evaluator/              # Profile evaluation
│   │   ├── page.tsx            # Form (prefilled from user facts)
│   │   └── history/            # Past evaluation runs
│   ├── alumni/                 # Alumni discovery
│   ├── admin/                  # Admin dashboard (gated by is_admin)
│   └── api/                    # API route handlers
│       ├── chat/               # POST — AI counselor
│       ├── evaluate/           # POST — profile scoring + persists facts
│       ├── alumni/             # POST — alumni search
│       ├── scholarships/       # GET/POST/PUT/DELETE
│       ├── saved-scholarships/ # GET/POST — toggle bookmarks
│       ├── acceptance-rate/    # GET — university acceptance rates
│       └── admin/scholarships/scrape/  # POST — trigger scraper
├── components/                 # React UI components
│   ├── auth/                   # AuthForm, UserMenu
│   ├── chat/                   # ChatWindow, MessageBubble, RoadmapCard, etc.
│   ├── evaluator/              # ProfileForm, EvaluationResult, TrafficLight, etc.
│   ├── scholarships/           # ScholarshipCard, SaveButton, SearchBar, etc.
│   ├── alumni/                 # Alumni search form and results
│   ├── layout/                 # AppShell, Sidebar, AdminSidebar, SidebarUser
│   └── ui/                     # Primitives: Button, Card, Badge, Spinner, etc.
├── lib/                        # Core business logic
│   ├── openai.ts               # OpenAI client singleton
│   ├── supabase.ts             # Anon-key shim for back-compat
│   ├── supabase/
│   │   ├── client.ts           # Browser client (cookie-aware via @supabase/ssr)
│   │   ├── server.ts           # Server-component client (Next cookies())
│   │   ├── service.ts          # Service-role client (admin writes)
│   │   ├── middleware.ts       # Middleware-side session refresh
│   │   └── env.ts              # Env-var helpers
│   ├── chat.ts                 # Chat parsing utilities
│   ├── chat-sessions.ts        # Supabase-backed chat session helpers
│   ├── evaluations.ts          # Save/list evaluation history
│   ├── saved-scholarships.ts   # Bookmark CRUD + listSaved with join
│   ├── user-facts.ts           # Generic key/value upserts for user_scholarship_facts
│   ├── profile-facts.ts        # Canonical profile key map + form ↔ facts mappers
│   ├── alumni.ts               # Alumni search with Exa + OpenAI
│   ├── rag.ts                  # Vector embeddings and knowledge retrieval (used by knowledge ingest only)
│   ├── scholarshipScraper.ts   # Admin scrape pipeline
│   ├── scholarshipNormalizedWriter.ts  # Idempotent write to country/org/field/scholarship/scholarship_fields
│   ├── scholarshipTransform.ts # SCHOLARSHIP_SELECT + joined-row → app-type mapper
│   └── study-abroad-knowledge.ts  # Hardcoded local knowledge base used by /api/chat
├── scripts/                    # Data ingestion / utility scripts
│   ├── scholarshipDB.ts        # Scrape sources and seed Supabase (npm run db:seed)
│   ├── uploadSnapshotToSupabase.ts  # Upload JSON snapshot (npm run db:upload-snapshot)
│   ├── ingestKnowledgeToSupabase.ts # Chunk + embed knowledge (npm run db:ingest-knowledge)
│   └── checkSchema.ts          # Verify all migrations are applied
└── supabase/migrations/        # SQL schema migrations (001..004)
```

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        BROWSER / USER                           │
│                                                                 │
│  / (landing)  /counselor  /scholarships  /evaluator  /alumni   │
│                /login  /signup  /admin                          │
└───────────────────────────┬─────────────────────────────────────┘
                            │  HTTP (Supabase auth cookies)
┌───────────────────────────▼─────────────────────────────────────┐
│                  middleware.ts (route gating)                   │
└───────────────────────────┬─────────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────────┐
│                     NEXT.JS APP ROUTER                          │
│                                                                 │
│  /api/chat          /api/evaluate       /api/alumni             │
│  /api/scholarships  /api/saved-scholarships                     │
│  /api/acceptance-rate                                           │
│  /api/admin/scholarships/scrape                                 │
└─────┬─────────────────────┬──────────────────────┬──────────────┘
      │                     │                      │
┌─────▼─────────┐   ┌───────▼──────────────┐  ┌────▼──────────────┐
│   OpenAI      │   │   Supabase           │  │  Exa / Interfaze  │
│               │   │                      │  │                   │
│ - Intent      │   │  Auth (email + OAuth)│  │ - Alumni search   │
│ - Profile     │   │  scholarships +      │  │ - Web scraping    │
│   extraction  │   │   countries / orgs / │  │ - Acceptance rate │
│ - Response    │   │   fields (m:n)       │  │                   │
│ - Evaluation  │   │  chat_sessions       │  └───────────────────┘
│ - Embeddings  │   │  evaluations         │
│ - Web search  │   │  saved_scholarships  │
└───────────────┘   │  user_scholarship_   │
                    │   facts (key/value)  │
                    │  knowledge_chunks    │
                    │   (pgvector)         │
                    └──────────────────────┘
```

---

## Feature Breakdown

### 1. Counselor (AI Chat)

`/counselor` → `POST /api/chat` (auth required)

Each user turn fires **three sequential OpenAI calls** plus two parallel Supabase reads:

1. **Intent classification** (LLM, `INTENT_PROMPT` + `INTENT_SCHEMA`) — input: full message history. Returns `intent`, `needsWebSearch`, `shouldUseKnowledgeBase`, `shouldUseScholarshipMatching`, `responseGoal`.
2. **Profile extraction** (LLM, `PROFILE_EXTRACTION_PROMPT` + `PROFILE_SCHEMA`) — input: full message history. Returns an `ExtractedProfile` (educationLevel, degreeTarget, gpa, gpaScale, ielts, toefl, sat, projectExperience, extracurricularActivities, fundingPreference, targetCountriesOrRegions, …).
3. **Parallel reads:** `loadScholarshipLookup()` from Supabase + `listFactsAsRecord(user)` from `user_scholarship_facts`.
4. **Build shortlist + retrieve knowledge** (no LLM): rank scholarships by score against the extracted profile; keyword-match `studyAbroadKnowledge` chunks against profile + messages.
5. **Response generation** (LLM, `KB_RESPONSE_PROMPT` or `WEB_RESPONSE_PROMPT` + `CHAT_RESPONSE_SCHEMA`) — input JSON contains `intent`, `profile`, `knownUserFacts`, `localKnowledge`, `validatedScholarships`, `recommendationMode`. The web variant additionally enables the `web_search_preview` tool.
6. **Persist** (parallel): full message thread → `chat_sessions`, profile → `user_scholarship_facts` via `profileToFacts()` (only changed values are written).
7. Stream the assistant text back; the response also carries an `X-Session-Id` header so the client can resume.

The page itself is server-rendered: `/counselor` lists the user's past sessions; `/counselor/[sessionId]` rehydrates messages from `chat_sessions`; `/counselor/new` starts a fresh chat.

### 2. Profile Evaluator

`/evaluator` → `POST /api/evaluate` (auth required)

1. The page is server-rendered: it loads the user's facts and prefills `ProfileForm` via `factsToEvaluatorProfile()`.
2. Student adjusts the form (GPA + scale, IELTS/TOEFL/SAT, nationality, field, degree target, projects, extracurriculars).
3. Student picks up to three scholarships from `ScholarshipSelector`.
4. Backend normalizes GPA to 4.0 scale, sends profile + scholarships to OpenAI, gets back `EvaluationResult[]` (traffic light, match %, strengths, specific gaps with advice).
5. The full run is saved to `evaluations`, **and** the form profile is upserted to `user_scholarship_facts` via `evaluatorProfileToFacts(profile, "evaluator")` so the chat counselor immediately has the same info.
6. Results are optionally enriched with university acceptance-rate data.
7. `/evaluator/history` lists past runs.

### 3. Alumni Discovery

`/alumni` → `POST /api/alumni` (auth required)

1. User provides dream university, field, nationality, current school.
2. OpenAI generates search queries.
3. Exa API performs live web searches.
4. Results deduplicated and ranked by confidence.
5. OpenAI annotates with match reasons and profile links.

### 4. Scholarship Directory

`/scholarships` → `GET /api/scholarships` (public)

- Filter by country, degree, funding type, free-text search.
- **Saved-only toggle** (only visible when signed in) filters to bookmarked scholarships using `/api/saved-scholarships`. The toggle stays in sync with `SaveButton` via a `scholarpath:saved-changed` `CustomEvent`.
- Each card has a bookmark button (`SaveButton`) that POSTs to `/api/saved-scholarships`.
- Detail page at `/scholarships/[id]`.
- Dedicated page at `/scholarships/saved` shows only the user's bookmarks.
- Reads are joined: `select(SCHOLARSHIP_SELECT)` pulls country/organization/fields in one round-trip.

### 5. Admin / Scraping

`/admin/*` → gated by `profiles.is_admin`.
`POST /api/admin/scholarships/scrape` triggers the scraper pipeline.

- Sources are scraped via Interfaze (default) or OpenAI's `web_search_preview`.
- Each scraped record flows through `upsertScholarshipNormalized()`: upsert country (by name) → upsert organization (by `name + country_id`) → upsert fields (by name) → insert/update scholarship (deduped by `(name, organization_id)`) → replace `scholarship_fields` link rows.
- The seed runner (`npm run db:seed`) and snapshot upload (`npm run db:upload-snapshot`) both flow through the same writer — re-running is idempotent.

---

## Database Schema (Supabase)

### Normalized scholarship schema (migration 004)

Scholarships are split across lookup tables so countries / organizations / fields can be reused across rows.

```sql
countries (id uuid pk, name unique, flag_url)

organizations (id uuid pk, name, country_id → countries.id, unique(name, country_id))

fields (id uuid pk, name unique)

scholarships (
  id              uuid pk,
  name            text,
  country_id      uuid → countries.id,
  organization_id uuid → organizations.id,
  degree          text,          -- "bachelors" | "masters" | "phd" | "any" | …
  funding         text,
  deadline        text,
  description     text,
  requirements    jsonb,         -- { academic, language: {...}, other }
  link            text,
  source_name, source_url,
  created_at, updated_at,
  unique(name, organization_id)
)

scholarship_fields (
  scholarship_id uuid → scholarships.id,
  field_id       uuid → fields.id,
  primary key (scholarship_id, field_id)
)
```

The app reads scholarships via a single `select(SCHOLARSHIP_SELECT)` join (see `lib/scholarshipTransform.ts`); writes go through `lib/scholarshipNormalizedWriter.ts` which upserts the lookup rows by natural key, dedupes the scholarship by `(name, organization_id)`, and replaces the `scholarship_fields` set.

### `knowledge_documents`
```sql
id           text PRIMARY KEY
title        text
category     text
source_type  text
source_url   text
status       text   -- "active" | "inactive"
metadata     jsonb
created_at   timestamptz
updated_at   timestamptz
```

### `knowledge_chunks`
```sql
id           bigserial PRIMARY KEY
document_id  text REFERENCES knowledge_documents(id)
chunk_index  integer
content      text
metadata     jsonb
embedding    vector(1536)   -- OpenAI text-embedding-3-small
created_at   timestamptz
-- IVFFlat cosine similarity index on embedding
-- RPC: match_knowledge_chunks(query_embedding, match_count, filter)
```

**RLS Policy:**
- Public read on scholarship-related tables (`countries`, `organizations`, `fields`, `scholarships`, `scholarship_fields`) and knowledge tables.
- Per-user tables (`profiles`, `chat_sessions`, `evaluations`, `saved_scholarships`, `user_scholarship_facts`) use `auth.uid() = user_id` so each user only sees their own rows.
- Admin writes (scraper, scholarship CRUD) use `SUPABASE_SERVICE_ROLE_KEY` server-side only.

---

## Environment Variables

Create a `.env.local` file in the project root with the following:

```env
# ── Required ──────────────────────────────────────────────────────

# OpenAI API key — used for chat, evaluation, embeddings, web search
OPENAI_API_KEY=sk-...

# Supabase project URL
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co

# Supabase public anon key (safe for browser)
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...

# Supabase service role key (server-side admin operations only — NEVER expose to client)
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Site origin for OAuth redirect URLs. Use http://localhost:3000 in dev,
# the deployed origin in production. Must also be added to Supabase →
# Authentication → URL Configuration → Redirect URLs.
NEXT_PUBLIC_SITE_URL=http://localhost:3000

# ── Optional: Feature Keys ─────────────────────────────────────────

# Exa API key — required for alumni discovery feature
EXA_API_KEY=...

# Interfaze API key — required for scholarship scraping pipeline
INTERFAZE_API_KEY=...

# ── Optional: Model Overrides ─────────────────────────────────────
# Defaults shown — override if needed

# Model used for chat intent classification and response generation
OPENAI_CHAT_MODEL=gpt-4o-mini

# Model used for profile evaluation scoring
OPENAI_EVALUATE_MODEL=gpt-4o-mini

# Model used for generating alumni search queries
OPENAI_ALUMNI_MODEL=gpt-4o-mini

# Model used for vector embeddings (1536-dim)
OPENAI_EMBEDDING_MODEL=text-embedding-3-small

# Model used during scholarship scraping
OPENAI_SCRAPE_MODEL=gpt-4o-mini

# ── Optional: Scraping Config ─────────────────────────────────────

# Provider for scholarship scraping: "interfaze" (default) or "openai"
SCHOLARSHIP_SCRAPE_PROVIDER=interfaze

# Max scholarships extracted per source URL
SCHOLARSHIPS_PER_SOURCE=10

# Interfaze model selection
INTERFAZE_MODEL=interfaze-beta
```

> **Security note:** `SUPABASE_SERVICE_ROLE_KEY` must never be exposed to the client. Only use it in Next.js API routes (server-side). The variables prefixed `NEXT_PUBLIC_` are intentionally safe for browser exposure.

---

## Data Flow Summary (per chat turn)

```
User message
  → middleware refreshes session → 401 if not signed in
  → /api/chat handler:
      ├─ Intent classification        (OpenAI #1)
      ├─ Profile extraction           (OpenAI #2)        ┐ run in parallel
      ├─ loadScholarshipLookup        (Supabase read)    │ with each other
      └─ listFactsAsRecord            (Supabase read)    ┘
  → Build shortlist (in-memory ranking)
  → Retrieve knowledge (keyword scoring vs studyAbroadKnowledge)
  → Response generation               (OpenAI #3, optional web_search_preview)
  → Persist (parallel):
      ├─ chat_sessions row update     (messages + profile + recs)
      └─ upsertFacts                  (profile fields → user_scholarship_facts)
  → Streamed text response (header X-Session-Id)
```

What the LLM actually sees on the response call:
- `intent`, `profile` (from the two extraction calls above)
- `knownUserFacts` — facts already in `user_scholarship_facts`, formatted as `- key: value` so the model doesn't re-ask
- `localKnowledge` — keyword-matched chunks from `study-abroad-knowledge.ts`
- `validatedScholarships` — top-N ranked scholarships with `fitReasons` (only for `personalized_matching`)
- The web variant additionally has the latest user message + `web_search_preview` tool

---

## npm Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start dev server on port 3000 |
| `npm run build` | Production build |
| `npm run start` | Run production server |
| `npm run lint` | ESLint check |
| `npm run db:seed` | Scrape scholarships and seed Supabase (idempotent) |
| `npm run db:upload-snapshot` | Upload local JSON snapshot to Supabase |
| `npm run db:ingest-knowledge` | Chunk, embed, and store knowledge docs in Supabase |
| `npx tsx scripts/checkSchema.ts` | Verify all migrations (003 + 004) are applied |

---

## Authentication & Per-User Data

Auth is handled by **Supabase Auth** via `@supabase/ssr`. Two providers are enabled:

- **Email + password** — built into Supabase, no extra config beyond enabling email confirmations in the dashboard.
- **Google OAuth** — configured in Supabase Dashboard → Authentication → Providers → Google. The redirect URI given to Google Cloud must be `https://<project-ref>.supabase.co/auth/v1/callback`. `NEXT_PUBLIC_SITE_URL` must be added to Supabase → Authentication → URL Configuration → Redirect URLs.

### Route gating

`middleware.ts` refreshes the session on every request and gates routes:

| Route prefix | Access |
|---|---|
| `/`, `/scholarships`, `/scholarships/[id]`, `/login`, `/signup`, `/auth/*` | Public |
| `/counselor`, `/evaluator`, `/alumni` | Authed user required |
| `/admin/*` | Authed user with `profiles.is_admin = true` |

### Per-user tables (`supabase/migrations/003_user_data.sql`)

| Table | Purpose |
|---|---|
| `profiles` | Extends `auth.users` with `is_admin`, name, avatar. Auto-created via `handle_new_user` trigger. |
| `chat_sessions` | Persisted counselor conversations (messages + extracted profile + recommendations). |
| `evaluations` | Snapshots of every profile-vs-scholarship run. |
| `saved_scholarships` | User bookmarks (composite PK `(user_id, scholarship_id)`). |
| `user_scholarship_facts` | Key/value memory the AI writes during chat — e.g. `gpa`, `degree_target`, `target_countries`. PK `(user_id, key)` enforces dedupe; `value` is JSONB to support strings, numbers, arrays. Loaded into the chat prompt and prefills the evaluator's ProfileForm. |

All four tables enable RLS with a single `auth.uid() = user_id` policy, so users can only read/write their own rows.

### Bootstrapping the first admin

After a user signs up, run once in the Supabase SQL editor:

```sql
update public.profiles set is_admin = true where email = '<your-email>';
```

### New pages added

- `/login`, `/signup`, `/auth/callback`
- `/counselor` (session list), `/counselor/new`, `/counselor/[sessionId]`
- `/evaluator/history`
- `/scholarships/saved`

---

## User memory (facts)

`user_scholarship_facts` is a per-user key/value store the AI agent reads from and writes to. The composite primary key `(user_id, key)` and a value-equality check in the writer guarantee no duplicate rows and no needless `updated_at` churn.

### Canonical keys (`lib/profile-facts.ts`)

`PROFILE_FACT_KEYS` is the single source of truth. Both the chat extractor and the evaluator form persist into the same keys, so the chat prompt and the evaluator prefill always see a consistent view.

| Key                          | Type                                            | Written by chat? | Written by evaluator? |
|------------------------------|-------------------------------------------------|:-:|:-:|
| `education_level`            | `"high_school" \| "undergraduate" \| "graduate"` | ✅ | ✅ |
| `degree_target`              | `"undergraduate" \| "masters" \| "phd"`         | ✅ | ✅ |
| `field_of_study`             | string                                          | ✅ | ✅ |
| `nationality`                | string                                          | ✅ | ✅ |
| `gpa`                        | number                                          | ✅ (coerced) | ✅ |
| `gpa_scale`                  | `4 \| 10 \| 100`                                | ✅ | ✅ |
| `ielts`                      | number                                          | ✅ | ✅ |
| `toefl`                      | number                                          | ✅ | ✅ |
| `sat`                        | number                                          | ✅ | ✅ |
| `project_experience`         | string (markdown)                               | ✅ | ✅ |
| `extracurricular_activities` | string (markdown)                               | ✅ | ✅ |
| `funding_preference`         | `"full" \| "partial_or_full" \| "unspecified"`  | ✅ | — |
| `target_countries`           | `string[]`                                      | ✅ | — |

### Read / write paths

- **Write (chat):** `app/api/chat/route.ts` → `profileToFacts(extractedProfile, sessionId)` → `upsertFacts()`. Only non-null fields are pushed; values that match what's already stored are skipped.
- **Write (evaluator):** `app/api/evaluate/route.ts` → `evaluatorProfileToFacts(profile, "evaluator")` → `upsertFacts()`, runs in parallel with `saveEvaluation()`.
- **Read (chat prompt):** `listFactsAsRecord()` → `formatFactsForPrompt()` → injected into `KB_RESPONSE_PROMPT` / `WEB_RESPONSE_PROMPT` as `knownUserFacts`. The model is told to treat them as known and not re-ask.
- **Read (evaluator prefill):** `app/evaluator/page.tsx` (server component) → `listFactsAsRecord()` → `factsToEvaluatorProfile()` → passed as `initialProfile` prop to `EvaluatorClient`.

### Dedupe guarantees

- DB level: PK `(user_id, key)` blocks duplicate rows.
- App level: `upsertFacts()` pre-fetches existing values for the keys it's about to write and skips writes when the value is byte-equal (deep-equal for arrays). This keeps `updated_at` clean for "what changed recently" queries.
- Key normalization: `canonicalizeKey()` in `lib/user-facts.ts` lowercases + snake_cases incoming keys, so `"GPA"` / `"gpa"` / `"Grade Point Average"` cannot land as separate rows.
