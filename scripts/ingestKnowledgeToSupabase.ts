import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

dotenv.config({ override: true });

type KnowledgeDocumentInput = {
  id: string;
  title: string;
  category: string;
  sourceType?: string;
  sourceUrl?: string;
  metadata?: Record<string, unknown>;
  content: string;
};

function ensureEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`${name} is required.`);
  }

  return value;
}

function chunkText(content: string, maxChars = 1400, overlapChars = 200): string[] {
  const normalized = content.replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return [];
  }

  const chunks: string[] = [];
  let start = 0;

  while (start < normalized.length) {
    const end = Math.min(start + maxChars, normalized.length);
    chunks.push(normalized.slice(start, end).trim());
    if (end >= normalized.length) {
      break;
    }

    start = Math.max(end - overlapChars, start + 1);
  }

  return chunks.filter(Boolean);
}

async function embedBatch(client: OpenAI, inputs: string[]): Promise<number[][]> {
  const response = await client.embeddings.create({
    model: process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small",
    input: inputs,
  });

  return response.data.map((item) => item.embedding);
}

async function main() {
  const supabaseUrl = ensureEnv(
    "SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)",
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL,
  );
  const serviceRoleKey = ensureEnv(
    "SUPABASE_SERVICE_ROLE_KEY",
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
  const openAiApiKey = ensureEnv("OPENAI_API_KEY", process.env.OPENAI_API_KEY);

  const inputPath = path.resolve(process.cwd(), "scripts", "knowledge-documents.json");
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Knowledge input file not found: ${inputPath}`);
  }

  const raw = fs.readFileSync(inputPath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("Knowledge input must be a JSON array.");
  }

  const documents = parsed as KnowledgeDocumentInput[];
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const openai = new OpenAI({ apiKey: openAiApiKey });

  const documentRows = documents.map((doc) => ({
    id: doc.id,
    title: doc.title,
    category: doc.category,
    source_type: doc.sourceType ?? "internal",
    source_url: doc.sourceUrl ?? "",
    metadata: doc.metadata ?? {},
    status: "active",
  }));

  const { error: documentsError } = await supabase
    .from("knowledge_documents")
    .upsert(documentRows, { onConflict: "id" });

  if (documentsError) {
    throw new Error(`Knowledge document upsert failed: ${documentsError.message}`);
  }

  const chunkRows: Array<{
    document_id: string;
    chunk_index: number;
    content: string;
    metadata: Record<string, unknown>;
    embedding: number[];
  }> = [];

  for (const doc of documents) {
    const chunks = chunkText(doc.content);
    if (chunks.length === 0) {
      continue;
    }

    const embeddings = await embedBatch(openai, chunks);
    chunks.forEach((chunk, index) => {
      chunkRows.push({
        document_id: doc.id,
        chunk_index: index,
        content: chunk,
        metadata: {
          ...(doc.metadata ?? {}),
          title: doc.title,
          category: doc.category,
        },
        embedding: embeddings[index]!,
      });
    });
  }

  if (chunkRows.length === 0) {
    console.log("No knowledge chunks to upload.");
    return;
  }

  const { error: deleteError } = await supabase
    .from("knowledge_chunks")
    .delete()
    .in("document_id", documents.map((doc) => doc.id));

  if (deleteError) {
    throw new Error(`Existing chunk cleanup failed: ${deleteError.message}`);
  }

  const { error: chunksError } = await supabase
    .from("knowledge_chunks")
    .insert(chunkRows);

  if (chunksError) {
    throw new Error(`Knowledge chunk insert failed: ${chunksError.message}`);
  }

  console.log(`Uploaded ${documents.length} knowledge documents and ${chunkRows.length} chunks.`);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
