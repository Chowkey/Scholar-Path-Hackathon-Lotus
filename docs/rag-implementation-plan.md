# ScholarPath RAG Implementation Plan

## Goal

Move the chatbot from local keyword retrieval to a Supabase-backed hybrid RAG architecture:

- `structured scholarship queries` for personalized recommendations
- `vector retrieval` for concept and application guidance
- `web search fallback` for changing or official information

## Current State

The chat route currently:

- classifies intent
- extracts profile state
- retrieves local knowledge from a TypeScript file
- scores scholarships from a static data import
- falls back to web search for fresh info

The key limitation is that the knowledge retrieval path is not using the database yet.

## Proposed Data Model

### Existing table

`scholarships`

Keep using this table for structured scholarship matching.

### New tables

`knowledge_documents`

- one row per knowledge source
- stores title, category, source metadata, and status

`knowledge_chunks`

- one row per chunk of document text
- stores chunk content, metadata, and vector embedding

## Retrieval Strategy

### 1. Concept / guidance questions

Examples:

- What is an SOP?
- What documents do I need?
- Do I need IELTS?

Flow:

1. embed query
2. vector search `knowledge_chunks`
3. return top matching chunks
4. pass chunks into the answer-generation prompt

### 2. Personalized scholarship questions

Examples:

- What scholarships fit my profile?
- I want a fully funded master's in Germany for data science

Flow:

1. extract user profile
2. query / rank `scholarships`
3. return validated shortlist
4. let the model explain only from that shortlist

### 3. Latest info questions

Examples:

- What is the latest deadline?
- What are the current visa rules?

Flow:

1. detect freshness need
2. optionally retrieve local chunks for baseline context
3. use web search
4. answer with links to official or reputable sources

## Files Added

### Migration

`supabase/migrations/002_knowledge_rag.sql`

Adds:

- `knowledge_documents`
- `knowledge_chunks`
- `pgvector` extension
- `match_knowledge_chunks(...)` RPC function

### Retrieval helper

`lib/rag.ts`

Provides:

- `embedText(...)`
- `retrieveKnowledgeFromSupabase(...)`

### Ingestion script

`scripts/ingestKnowledgeToSupabase.ts`

Responsibilities:

- load source documents from JSON
- chunk content
- generate embeddings
- upsert documents
- replace chunks for those documents

## Recommended `/api/chat` Refactor

Replace the current local retrieval flow with:

1. `extractIntent(...)`
2. `extractProfile(...)`
3. route by strategy:

   - `concept_explainer` -> `retrieveKnowledgeFromSupabase(...)`
   - `application_guidance` -> `retrieveKnowledgeFromSupabase(...)`
   - `personalized_matching` -> Supabase scholarship shortlist
   - `latest_info` -> web search, optionally with retrieved chunks

4. generate structured reply
5. validate scholarship IDs against shortlist
6. save retrieved document IDs / chunk IDs in session logs

## Recommended Next Code Changes

### Phase 1

- create `knowledge-documents.json`
- run `002_knowledge_rag.sql`
- ingest documents with `scripts/ingestKnowledgeToSupabase.ts`

### Phase 2

- replace `study-abroad-knowledge.ts` retrieval in `/api/chat`
- use `lib/rag.ts` instead of local keyword matching

### Phase 3

- move scholarship shortlist generation from static import to Supabase query

### Phase 4

- store answer provenance in chat logs:
  - retrieved document IDs
  - chunk IDs
  - similarity scores
  - source strategy

## Why This Design Fits ScholarPath

- It keeps scholarship recommendations grounded in structured data.
- It makes concept and process guidance scalable beyond a hand-written file.
- It keeps web search limited to cases where freshness matters.
- It matches your current Supabase-based architecture without adding another database system too early.
