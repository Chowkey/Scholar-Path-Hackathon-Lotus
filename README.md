# ScholarPath

**ScholarPath** is a hackathon MVP for scholarship discovery and planning, aimed at students in Southeast Asia. It combines a Next.js 14 app with OpenAI-powered chat, profile evaluation, and optional Supabase-backed data and RAG.

## What you can do

| Area | Route | Description |
|------|--------|---------------|
| **AI Counselor** | `/counselor` | Chat about timelines, documents, SOPs, and next steps with follow-up questions that narrow the path. |
| **Scholarships** | `/scholarships` | Browse and filter programs; open a detail page for each listing. |
| **Profile Evaluator** | `/evaluator` | Compare your profile to specific scholarships and get a practical gap analysis. |
| **Alumni Discovery** | `/alumni` | Find alumni context around universities and fields (uses web search when configured). |
| **Admin** | `/admin` | Internal tools for scholarship management and imports (see codebase for routes). |

## Quick start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

```bash
npm run build   # production build
npm run start   # run production server
npm run lint    # ESLint
```

## Environment variables

Copy `.env.example` to `.env.local` and fill in what you need. Requirements depend on which features you turn on.

### Core (most AI features)

| Variable | Purpose |
|----------|---------|
| `OPENAI_API_KEY` | **Required** for chat, evaluation, embeddings, and many API routes. |

Optional model overrides (defaults are set in code): `OPENAI_CHAT_MODEL`, `OPENAI_EVALUATE_MODEL`, `OPENAI_ALUMNI_MODEL`, `OPENAI_EMBEDDING_MODEL`, `OPENAI_SCRAPE_MODEL`.

### Supabase (scholarship data in the app and scripts)

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` or `SUPABASE_URL` | Supabase project URL. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client-safe key for the app. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only; used by seed/upload/ingest scripts and admin operations. |

### Optional integrations

| Variable | Purpose |
|----------|---------|
| `EXA_API_KEY` | Alumni search and related flows that use Exa. |
| `INTERFAZE_API_KEY` | Scholarship scraping and acceptance-rate helpers that use Interfaze. |

Other tuning knobs used in scripts include `SCHOLARSHIPS_PER_SOURCE`, `INTERFAZE_MODEL`, and `SCHOLARSHIP_SCRAPE_PROVIDER` (see `scripts/` and `lib/scholarshipScraper.ts`).

## Database and content scripts

These use Node + `tsx` and typically need `OPENAI_API_KEY`, Supabase URL, and `SUPABASE_SERVICE_ROLE_KEY`:

```bash
npm run db:seed              # seed scholarship data (scripts/scholarshipDB.ts)
npm run db:upload-snapshot   # upload a snapshot to Supabase
npm run db:ingest-knowledge  # ingest knowledge for RAG/embeddings
```

## Stack

- **Framework:** Next.js 14 (App Router), TypeScript, React 18  
- **Styling:** Tailwind CSS, `@tailwindcss/typography`  
- **Data:** Supabase (`@supabase/supabase-js`) where configured  
- **AI:** OpenAI SDK; embeddings and chat/eval flows as implemented in `app/api/` and `lib/`  
- **UI:** Lucide icons, React Markdown (GFM), force-graph for graph-style views where used  

---

*Built as a hackathon prototype; behavior and APIs may evolve.*
