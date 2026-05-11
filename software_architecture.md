# ScholarPath — Software Architecture

A walkthrough of this project written for someone whose background is data structures, algorithms, and T-SQL, and who wants to be able to answer interview questions about it.

If an interviewer asks **"walk me through your project"**, the three-sentence answer is:

> ScholarPath is a Next.js 14 web app that helps students find and evaluate study-abroad scholarships. The frontend is React + Tailwind; the backend is a set of HTTP route handlers living inside the same Next.js project that talk to a Supabase (Postgres) database and to the OpenAI API. The AI features are structured: every LLM call is constrained by a JSON schema so the response can be parsed and used as data, not just displayed as text.

The rest of this document unpacks what each folder is doing and why.

---

## 1. The tech stack at a glance

| Thing | What it is | SQL/DSA analogy |
|---|---|---|
| **Next.js 14 (App Router)** | A React framework that runs on Node.js. It serves HTML pages *and* backend HTTP endpoints from one project. | Like an ASP.NET project where Razor pages and Web API controllers share the same codebase, except the "pages" are React components and routing is decided by folder structure. |
| **React 18** | A JavaScript library for building UIs out of reusable components (functions that return HTML-ish markup called JSX). | Like writing HTML, except each "tag" can be your own component with its own state and behavior. |
| **TypeScript** | JavaScript + static types. | Same relationship as C# has to a dynamic language — you get compile-time type checking. |
| **Tailwind CSS** | Utility-class CSS. You style elements by composing classes like `px-4 text-sm font-semibold` in the markup instead of writing separate `.css` files. | Think of it as inline styles but with a design system and responsive breakpoints built in. |
| **Supabase** | Hosted PostgreSQL + auto-generated REST/RPC API + an official JS SDK. | A managed Postgres database (exactly what you know from T-SQL, just a different dialect) with a client library that writes SQL for you. You still write real SQL for migrations. |
| **OpenAI SDK** | Node.js client for OpenAI's HTTP API. Used for chat, structured outputs, embeddings, and web search. | HTTP client wrapper — nothing exotic; the interesting part is the *JSON Schema* constraint (see §6). |
| **Exa** | A third-party search API, used for alumni and university data. | External REST API called from our backend. |
| **Interfaze** | Third-party LLM-based scraping API. | External REST API used by the seed script to turn scholarship webpages into structured rows. |

Everything runs in **one Node.js process** when you `npm run dev`. The "frontend" and "backend" are not separate servers; they are different folders that Next.js routes to differently.

---

## 2. How folder names become URLs (the App Router rule)

This is the single most important Next.js 14 concept. In the `app/` directory:

- A folder becomes a URL segment.
- A file named `page.tsx` inside that folder becomes the HTML page at that URL.
- A file named `route.ts` inside that folder becomes an HTTP API endpoint at that URL.
- A folder named `[id]` means a dynamic segment (like `:id` in Express).

Applied to this repo:

```
app/
├── page.tsx                       → GET /                  (landing page HTML)
├── layout.tsx                     → wrapper applied to every page (html/body, fonts, AppShell)
├── counselor/page.tsx             → GET /counselor         (chat UI)
├── evaluator/page.tsx             → GET /evaluator         (profile evaluator UI)
├── alumni/page.tsx                → GET /alumni            (alumni search UI)
├── scholarships/
│   ├── page.tsx                   → GET /scholarships      (list + filters)
│   └── [id]/page.tsx              → GET /scholarships/<id> (detail page)
├── admin/
│   ├── page.tsx                   → GET /admin
│   ├── scholarships/page.tsx      → GET /admin/scholarships
│   └── imports/page.tsx           → GET /admin/imports
└── api/
    ├── chat/route.ts              → POST /api/chat
    ├── evaluate/route.ts          → POST /api/evaluate
    ├── alumni/route.ts            → POST /api/alumni
    ├── scholarships/route.ts      → GET/POST /api/scholarships
    ├── scholarships/[id]/route.ts → PUT/DELETE /api/scholarships/<id>
    ├── acceptance-rate/…          → scholarship acceptance-rate lookup
    ├── acceptance-rate-exa/…      → same, Exa-powered variant
    └── admin/scholarships/…       → admin CRUD
```

**Mental model:** the `app/` folder contains everything the user interacts with. The `app/<something>/page.tsx` files are HTML pages. The `app/api/<something>/route.ts` files are the backend endpoints — this is the "api" folder you mentioned, and it behaves like a stored procedure surface exposed over HTTP.

### page.tsx vs route.ts

| | `page.tsx` | `route.ts` |
|---|---|---|
| Returns | React JSX (renders as HTML) | `NextResponse.json(...)` or a `Response` |
| Called by | User's browser navigating to a URL | `fetch()` calls from the frontend (or curl, Postman, etc.) |
| Analogy | A Razor page / MVC view | A Web API controller action |

### Server components vs client components

React components in the `app/` tree default to **server components**: they run on the server, can read the database directly, and send rendered HTML to the browser. The browser never loads their code.

A file that starts with `"use client"` is a **client component**. It ships JavaScript to the browser, where it can use `useState`, `useEffect`, event handlers, etc.

In this repo, most pages are thin server components that render a client component doing the real work. Examples of client components: `components/chat/ChatWindow.tsx`, `components/evaluator/EvaluatorClient.tsx`, `app/scholarships/page.tsx`, `app/admin/scholarships/page.tsx`. Everything else is a server component.

**Why this split exists (the interview answer):** server components let you do database queries and secret-key work where the code stays on the server; client components are needed for interactivity. You keep as much as possible on the server so less JavaScript ships to the user.

---

## 3. Folder-by-folder tour

### `app/` — pages and API routes

Already covered above. Two things worth repeating:

- `app/layout.tsx` is a root wrapper applied to every page. It sets up the `<html>`/`<body>` tags, loads Google fonts, and wraps children in `AppShell` (the sidebar/topbar chrome in `components/layout/`).
- `app/globals.css` is the only global stylesheet. Tailwind generates the rest from class names in your JSX.

### `app/api/` — backend route handlers

Each `route.ts` exports named functions (`GET`, `POST`, `PUT`, `DELETE`) that Next.js invokes when a request with that method hits the URL. Concretely:

- **`api/chat/route.ts`** — counselor chat pipeline (see §5 — this is the largest and most interesting file).
- **`api/evaluate/route.ts`** — takes a student profile + a list of scholarships, asks OpenAI to produce a strict-JSON evaluation for each (green/yellow/red traffic light, strengths, gaps, advice), returns it to the frontend.
- **`api/alumni/route.ts`** — alumni discovery. Uses Exa for web search plus OpenAI to synthesize results.
- **`api/scholarships/route.ts`** — `GET` reads from the `scholarships` table in Supabase with optional `country`, `degree`, `funding`, `query` filters; `POST` inserts a new scholarship using the service-role client (bypasses RLS).
- **`api/scholarships/[id]/route.ts`** — `PUT` updates and `DELETE` deletes by id. `[id]` is the dynamic route segment.
- **`api/acceptance-rate/…`** and **`api/acceptance-rate-exa/…`** — university acceptance-rate lookups for the evaluator feature.
- **`api/admin/scholarships/…`** — admin-side mutations.

All of these are plain async functions that return JSON. If you've used ASP.NET Web API, the mental model is `[HttpGet]` / `[HttpPost]` controller methods.

### `components/` — reusable React components, grouped by feature

- `components/chat/` — `ChatWindow`, `ChatInput`, `MessageBubble`, `RoadmapCard`, `ScholarshipChip`. These are the visual pieces of `/counselor`.
- `components/evaluator/` — `EvaluatorClient` (the stateful client component), `ProfileForm`, `ScholarshipSelector`, `EvaluationResult`, `GapItem`, `TrafficLight`.
- `components/scholarships/` — scholarship list/detail UI pieces.
- `components/layout/` — `AppShell`, `Sidebar`, `AdminSidebar` (the app chrome shared across pages).
- `components/ui/` — generic primitives like `Button`, `Card`, `Select`.

**Pattern to notice:** a page file (e.g. `app/evaluator/page.tsx`) is a thin server component that imports a big client component (`EvaluatorClient`) which holds all the state, fetches, and event handlers. This keeps the "server boundary" explicit.

### `lib/` — shared non-UI code

Think of this as your reusable domain layer. No React components here, just TypeScript modules imported by both route handlers and client components:

- **`lib/openai.ts`** — lazy singleton factory `getOpenAIClient()`. Throws if `OPENAI_API_KEY` is missing. Every route that talks to OpenAI goes through this one place.
- **`lib/supabase.ts`** — two client factories: `createBrowserClient()` (anon key, respects Row-Level Security, safe to use on the client or for public reads) and `createServiceClient()` (service-role key, bypasses RLS, **server-only**). This distinction is interview-important.
- **`lib/rag.ts`** — `embedText(input)` calls OpenAI's embedding model and returns a number[] vector. `retrieveKnowledgeFromSupabase(query)` embeds the query and calls the Postgres RPC `match_knowledge_chunks` to do vector similarity search (see §7).
- **`lib/types.ts`** — the single source of truth for domain types: `Scholarship`, `ProfileFormData`, `EvaluationResult`, `AlumniMatch`, etc. Every component and route imports from here.
- **`lib/scholarshipTransform.ts`** — converts between the database row shape (`ScholarshipRow`, snake_case, `field_of_study`, `language_requirements` as jsonb) and the UI shape (`Scholarship`, camelCase, structured `languageRequirements`). Route handlers are expected to go through `rowToScholarship` / `scholarshipToRow` — don't hand-massage DB rows elsewhere.
- **`lib/scholarshipOptions.ts`** — enum-like lists and normalizers (e.g. `normalizeCountry`, `normalizeDegreeLevel`).
- **`lib/scholarshipScraper.ts`** — calls the Interfaze scraping API to turn raw URLs into scholarship objects; used by the seed script.
- **`lib/chat.ts`** — pure helpers for chat rendering: parses the `##ROADMAP## … ##END##` block out of the assistant's message, slugifies scholarship names.
- **`lib/chat-storage.ts`** — dev-only persistence. Writes chat sessions to `data/chat-sessions.json` on disk. In production you would replace this with a DB table.
- **`lib/study-abroad-knowledge.ts`** — a hard-coded, in-memory list of knowledge snippets with `keywords` arrays. A simple keyword-scoring fallback used by the chat route when the full RAG pipeline isn't needed.
- **`lib/acceptance-rate.ts`**, **`lib/alumni.ts`** — external API integrations for those two features.
- **`lib/utils.ts`** — misc helpers (e.g. `normalizeGpa`).

### `scripts/` — one-off Node scripts

Run with `tsx` (a TypeScript runner). These are *not* part of the web app; they're admin/ETL jobs you run from your terminal:

- `scholarshipDB.ts` (`npm run db:seed`) — scrapes scholarships via Interfaze and upserts them into Supabase.
- `uploadSnapshotToSupabase.ts` (`npm run db:upload-snapshot`) — pushes the committed `scholarships-snapshot.json` into Supabase. Useful when you don't want to call the scraper.
- `ingestKnowledgeToSupabase.ts` (`npm run db:ingest-knowledge`) — chunks documents, generates embeddings via OpenAI, and inserts them into the `knowledge_chunks` table for RAG.
- `discovered-sources.json`, `scholarships-snapshot.json` — committed data files used/produced by the scripts.

### `supabase/migrations/` — SQL schema (this is the part you'll recognize)

- `001_scholarships.sql` — creates the `scholarships` table, an `updated_at` trigger, and a Row-Level Security policy `"Public read"` that allows anyone with the anon key to SELECT. Writes require the service-role key.
- `002_knowledge_rag.sql` — creates the `knowledge_chunks` table (content + embedding vector + metadata) and the `match_knowledge_chunks(query_embedding, match_count, filter)` function used by `lib/rag.ts`. This is vanilla SQL/PLpgSQL plus the `pgvector` extension.

These are hand-run against Supabase; there's no migration tool automating them.

### `data/` — runtime-written JSON

Created at runtime by `lib/chat-storage.ts`. Not checked into git meaningfully; treat it as ephemeral local state.

### `docs/` and `implementation_plan.md`

Design notes. `docs/chatbot-flow.md` sketches the counselor pipeline; `docs/rag-implementation-plan.md` covers the RAG design; `implementation_plan.md` at the root is the historical plan for adding Supabase + the scraper.

### Config files

- `package.json` — dependencies and the npm scripts listed in the README.
- `tsconfig.json` — TypeScript config. Notably `"paths": { "@/*": ["./*"] }`, which is why imports look like `@/lib/supabase` instead of `../../../lib/supabase`.
- `tailwind.config.ts`, `postcss.config.mjs` — Tailwind + PostCSS setup.
- `next.config.mjs` — Next.js config (minimal here).
- `.eslintrc.json` — linting rules (`next/core-web-vitals`).

---

## 4. Request lifecycle, end to end

Take `/scholarships` as a concrete example:

1. User types `http://localhost:3000/scholarships`.
2. Next.js routes to `app/scholarships/page.tsx`. Because that file starts with `"use client"`, it's a client component and its JS is shipped to the browser.
3. The client component mounts in the browser and runs a `fetch('/api/scholarships?…')`.
4. That request hits `app/api/scholarships/route.ts → GET(request)`. The handler calls `createBrowserClient()`, builds a Supabase query with filters, runs it, maps each row through `rowToScholarship()`, and returns JSON.
5. The browser receives the JSON, updates React state, re-renders the scholarship cards.

The **`evaluator`** page works the same way except the fetch target is `/api/evaluate` and the request body includes the profile + selected scholarships.

The **`counselor`** page is almost the same, but the response is a streaming `text/plain` body (see §5) that the UI appends token-by-token to the chat window.

---

## 5. The counselor chat pipeline (`app/api/chat/route.ts`)

This is the most algorithmically interesting file in the repo. A single `POST` handler runs a multi-stage pipeline. An interviewer will dig into this if you list "AI counselor" on your CV.

**Input:** the full conversation history (`messages: [{role, content}, …]`).

**Stages:**

1. **Parallel fan-out.** Three things kick off with `Promise.all`:
   - `extractIntent(body)` — LLM call that classifies the user's latest question into `concept_explainer | application_guidance | personalized_matching | latest_info` and also returns booleans `needsWebSearch`, `shouldUseKnowledgeBase`, `shouldUseScholarshipMatching`.
   - `extractProfile(body)` — LLM call that pulls out structured fields (degree target, country, field, IELTS, GPA, etc.) from the conversation.
   - `loadScholarshipLookup()` — fetches all scholarships from Supabase.

   Both LLM calls use **strict JSON-schema output** (see §6), so their results are already typed objects, not strings to regex.

2. **Shortlist generation** (`buildShortlist`). Rule-based scoring only — no LLM. For each scholarship, score based on degree match, country/region match (via a `REGION_ALIASES` table), field-of-study token overlap, and funding preference. Filter to positive scores, sort descending, take top 8. This is classic algorithmic code; call it out in interviews as the deterministic half of the "retrieval-augmented generation" idea.

3. **Knowledge retrieval** (`retrieveKnowledge`). Keyword-scores the in-memory `studyAbroadKnowledge` array against the combined conversation text. Top 4 chunks. This is a lightweight fallback — the full RAG path lives in `lib/rag.ts` and uses real vector search.

4. **Response generation.** Branches on `intent.needsWebSearch`:
   - `generateKnowledgeResponse` — standard structured-output LLM call.
   - `generateWebFallbackResponse` — adds `tools: [{ type: "web_search_preview" }]` to the OpenAI request so the model can search the web before answering.

   Both return the same `CHAT_RESPONSE_SCHEMA` shape: `{ phase, assistantMessage, followUpQuestion, recommendedScholarshipIds, nextSteps }`.

5. **Guardrails** (`validateRecommendations`). Downgrades `phase: "recommend"` back to `"ask_more"` if the profile isn't specific enough, and whitelists `recommendedScholarshipIds` against the shortlist — so the model cannot recommend scholarships it wasn't shown. This is the "don't trust the LLM" layer.

6. **Rendering** (`buildFinalAssistantText`). Concatenates the human-readable Markdown with a machine-parseable roadmap block:

   ```
   ##ROADMAP##
   - Scholarship A | Country | Deadline
   - …
   1. Step one
   2. Step two
   ##END##
   ```

   The client-side `lib/chat.ts → parseRoadmap` extracts this and renders it as a card. **Removing these sentinels breaks the UI** — treat them like a wire protocol.

7. **Persistence.** `saveChatSession` appends to `data/chat-sessions.json`.

8. **Streaming.** `streamText` chunks the already-assembled string into ~140-char pieces and pushes them through a `ReadableStream` with a 12ms delay, so the UI feels like it's generating text live. Note: this is a fake stream — the full response is computed first, then dribbled out. Be honest about this if asked.

**The interview-ready summary of this pipeline:**
> The chat endpoint first runs two parallel LLM classification calls and a DB fetch; uses rule-based scoring to build a shortlist of eligible scholarships; then makes a final LLM call with the shortlist + retrieved knowledge as context, constrained to a strict JSON schema. A validation step ensures the LLM can only recommend scholarships from the shortlist. The final response is rendered as Markdown with an embedded roadmap block the UI parses.

---

## 6. Why every LLM call has a JSON schema

Look at the OpenAI calls in `app/api/chat/route.ts` and `app/api/evaluate/route.ts`. They all look like:

```ts
openai.responses.create({
  model: …,
  instructions: PROMPT,
  input: JSON.stringify(messages),
  text: {
    format: {
      type: "json_schema",
      name: "…",
      schema: SOME_SCHEMA,
      strict: true,
    },
  },
});
```

This is **OpenAI Structured Outputs**. The API guarantees the response will conform to the JSON Schema you pass in. Without this, you'd have to parse free-form text, handle markdown code fences, retry on malformed output, etc. With it, you can `JSON.parse` the response and treat it as typed data — which is exactly what this codebase does.

**Interview talking point:** every AI feature in this project produces *structured data, not prose*. The prose is derived from that structured data at the end (in `buildFinalAssistantText`). That's what makes the features composable with deterministic code like the shortlist scorer and the recommendation whitelist.

---

## 7. RAG in one paragraph

Retrieval-Augmented Generation (RAG) is how the knowledge-base side of the counselor works at scale:

1. At ingest time (`scripts/ingestKnowledgeToSupabase.ts`) each document is split into chunks; each chunk is sent to OpenAI's `text-embedding-3-small` model, which returns a ~1536-dimensional vector capturing the chunk's semantic content; each chunk + its vector is inserted into the `knowledge_chunks` table.
2. At query time (`lib/rag.ts → retrieveKnowledgeFromSupabase`) the user's question is embedded the same way, then the Postgres function `match_knowledge_chunks` returns the top-K chunks by cosine similarity (using the `pgvector` extension). Those chunks are passed to the LLM as context in the prompt.

**Think of the embedding as a hash that preserves meaning** — two pieces of text with similar meaning get similar vectors, so you can do "nearest neighbor search by meaning" instead of "exact keyword match." The similarity search itself is just linear algebra over an indexed column — SQL is doing the heavy lifting.

---

## 8. Environment and secrets

Config comes from environment variables loaded from `.env` / `.env.local`:

- `OPENAI_API_KEY` — required for every AI feature.
- `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` — public Supabase creds, used by `createBrowserClient()`. Safe to ship to the browser. RLS policies (defined in the SQL migrations) decide what the anon key can read/write.
- `SUPABASE_SERVICE_ROLE_KEY` — server-only, bypasses RLS. Used by `createServiceClient()`. **Never import the service client into a client component** — it would leak the key.
- `EXA_API_KEY`, `INTERFAZE_API_KEY` — optional, only needed for alumni search and the scholarship scraper.
- Optional model overrides: `OPENAI_CHAT_MODEL`, `OPENAI_EVALUATE_MODEL`, `OPENAI_ALUMNI_MODEL`, `OPENAI_EMBEDDING_MODEL`, `OPENAI_SCRAPE_MODEL`.

The `NEXT_PUBLIC_` prefix is Next.js's rule for "this variable is allowed to be inlined into the browser bundle." Everything without that prefix stays on the server.

---

## 9. Likely interview questions and how to answer them

**"What is Next.js's App Router and why did you use it?"**
App Router (the `app/` directory) is the current routing system in Next.js 14. Routes are derived from the folder structure, and each route can be either a React page (`page.tsx`) or an HTTP handler (`route.ts`). It also supports React Server Components, which let parts of the UI render on the server and skip shipping that JS to the browser. I used it because it lets me keep the UI, the backend, and shared types in one TypeScript project without wiring up a separate API server.

**"Why Supabase instead of raw Postgres?"**
Supabase *is* Postgres — plus hosting, an authentication layer I'm not using yet, and a JS SDK that generates SQL under the hood. The RLS (Row-Level Security) model lets me expose a safe read-only anon key to the browser and keep writes behind the service-role key on the server. I still wrote the schema and the vector-search RPC in plain SQL (`supabase/migrations/*.sql`).

**"How does the AI counselor avoid hallucinating scholarships?"**
Three layers: (1) I fetch the full scholarship list from Postgres and run a deterministic rule-based scorer to build a shortlist before the LLM is called; (2) the LLM's response is constrained by a JSON schema and includes a `recommendedScholarshipIds` array; (3) a `validateRecommendations` step filters that array against the shortlist, so the LLM cannot surface anything outside the validated set.

**"What is RAG in this project?"**
Chunked documents are embedded with OpenAI's `text-embedding-3-small` and stored in a Postgres `knowledge_chunks` table with a vector column. At query time the user's question is embedded and `match_knowledge_chunks` returns the top-K by cosine similarity using `pgvector`. Those chunks are fed into the prompt as context.

**"Why two Supabase clients?"**
Client-side code and public reads use the browser client with the anon key, which is gated by Row-Level Security. Server code that needs to insert, update, or delete uses the service-role client, which bypasses RLS. Keeping them in two separate factories (`createBrowserClient` vs `createServiceClient`) makes the privilege boundary obvious in every call site.

**"How does streaming work?"**
The chat endpoint returns a `ReadableStream` of `text/plain`. The UI reads the stream and appends chunks as they arrive. In this implementation the stream is actually synthetic — the full response is computed first and then chunked — so the UX feels live but it isn't true token-level streaming from the model. That's something I'd fix by piping OpenAI's streaming response through directly.

**"What would you change if you rebuilt this?"**
Move chat session storage out of the local JSON file and into Postgres; implement real token-level streaming from OpenAI; add authentication so the admin routes aren't open; add tests (there are none currently); and split the `chat/route.ts` pipeline into named stages so each is individually testable.

---

## 10. Suggested reading order for learning this codebase

1. `lib/types.ts` — the domain model.
2. `supabase/migrations/001_scholarships.sql` and `002_knowledge_rag.sql` — the data schema (familiar territory from T-SQL).
3. `lib/supabase.ts` and `lib/openai.ts` — the two external-service clients.
4. `app/api/scholarships/route.ts` — the simplest CRUD route; good for seeing how `GET`/`POST` handlers work.
5. `app/scholarships/page.tsx` — a client component fetching from that route.
6. `lib/scholarshipTransform.ts` — the DB ↔ UI shape boundary.
7. `lib/rag.ts` + `scripts/ingestKnowledgeToSupabase.ts` — the RAG pipeline.
8. `app/api/evaluate/route.ts` — a small, single-call LLM endpoint; shows the JSON-schema output pattern cleanly.
9. `app/api/chat/route.ts` — the full pipeline. Save this for last.
