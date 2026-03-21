import { createServiceClient } from "@/lib/supabase";
import { getOpenAIClient } from "@/lib/openai";

export type KnowledgeMatch = {
  id: number;
  document_id: string;
  title: string;
  category: string;
  content: string;
  chunk_index: number;
  metadata: Record<string, unknown>;
  similarity: number;
  source_type: string;
  source_url: string;
};

type KnowledgeSearchOptions = {
  category?: string;
  sourceType?: string;
  matchCount?: number;
};

type MatchKnowledgeChunkRow = {
  id: number;
  document_id: string;
  title: string;
  category: string;
  content: string;
  chunk_index: number;
  metadata: Record<string, unknown> | null;
  similarity: number;
  source_type: string;
  source_url: string;
};

function ensureEmbedding(response: unknown): number[] {
  const candidate = response as {
    data?: Array<{
      embedding?: number[];
    }>;
  };

  const embedding = candidate.data?.[0]?.embedding;
  if (!Array.isArray(embedding) || embedding.length === 0) {
    throw new Error("Embedding generation returned no vector.");
  }

  return embedding;
}

export async function embedText(input: string): Promise<number[]> {
  const openai = getOpenAIClient();
  const response = await openai.embeddings.create({
    model: process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small",
    input,
  });

  return ensureEmbedding(response);
}

export async function retrieveKnowledgeFromSupabase(
  query: string,
  options: KnowledgeSearchOptions = {},
): Promise<KnowledgeMatch[]> {
  const db = createServiceClient();
  const embedding = await embedText(query);

  const { data, error } = await db.rpc("match_knowledge_chunks", {
    query_embedding: embedding,
    match_count: options.matchCount ?? 5,
    filter: {
      ...(options.category ? { category: options.category } : {}),
      ...(options.sourceType ? { source_type: options.sourceType } : {}),
    },
  });

  if (error) {
    throw new Error(`Knowledge retrieval failed: ${error.message}`);
  }

  return ((data ?? []) as MatchKnowledgeChunkRow[]).map((item) => ({
    ...item,
    metadata: item.metadata ?? {},
  }));
}
