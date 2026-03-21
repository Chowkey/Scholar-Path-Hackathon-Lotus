-- 002_knowledge_rag.sql
-- Adds RAG-ready knowledge document storage and vector search helpers.
-- Run after 001_scholarships.sql in Supabase SQL Editor.

create extension if not exists vector;

create table if not exists knowledge_documents (
  id text primary key,
  title text not null,
  category text not null,
  source_type text not null default 'internal',
  source_url text not null default '',
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists knowledge_chunks (
  id bigserial primary key,
  document_id text not null references knowledge_documents(id) on delete cascade,
  chunk_index integer not null,
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  embedding vector(1536) not null,
  created_at timestamptz not null default now(),
  unique (document_id, chunk_index)
);

create index if not exists knowledge_documents_category_idx
  on knowledge_documents (category);

create index if not exists knowledge_documents_status_idx
  on knowledge_documents (status);

create index if not exists knowledge_chunks_document_id_idx
  on knowledge_chunks (document_id);

create index if not exists knowledge_chunks_embedding_cosine_idx
  on knowledge_chunks
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

drop trigger if exists knowledge_documents_updated_at on knowledge_documents;
create trigger knowledge_documents_updated_at
  before update on knowledge_documents
  for each row execute procedure update_updated_at();

alter table knowledge_documents enable row level security;
alter table knowledge_chunks enable row level security;

drop policy if exists "Public read knowledge documents" on knowledge_documents;
create policy "Public read knowledge documents"
  on knowledge_documents for select using (true);

drop policy if exists "Public read knowledge chunks" on knowledge_chunks;
create policy "Public read knowledge chunks"
  on knowledge_chunks for select using (true);

create or replace function match_knowledge_chunks(
  query_embedding vector(1536),
  match_count integer default 5,
  filter jsonb default '{}'::jsonb
)
returns table (
  id bigint,
  document_id text,
  title text,
  category text,
  content text,
  chunk_index integer,
  metadata jsonb,
  similarity double precision,
  source_type text,
  source_url text
)
language sql
as $$
  select
    kc.id,
    kc.document_id,
    kd.title,
    kd.category,
    kc.content,
    kc.chunk_index,
    kc.metadata,
    1 - (kc.embedding <=> query_embedding) as similarity,
    kd.source_type,
    kd.source_url
  from knowledge_chunks kc
  join knowledge_documents kd on kd.id = kc.document_id
  where kd.status = 'active'
    and (
      not (filter ? 'category')
      or kd.category = filter->>'category'
    )
    and (
      not (filter ? 'source_type')
      or kd.source_type = filter->>'source_type'
    )
  order by kc.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;
