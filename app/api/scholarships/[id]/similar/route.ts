import { NextRequest, NextResponse } from "next/server";
import { createBrowserClient } from "@/lib/supabase";
import {
  rowToScholarship,
  SCHOLARSHIP_SELECT,
  type ScholarshipJoinedRow,
} from "@/lib/scholarshipTransform";
import type { Scholarship } from "@/lib/types";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type SimilarMatch = { id: string; similarity: number };

export type SimilarScholarship = Scholarship & { similarity: number };

// GET /api/scholarships/[id]/similar?limit=10
// Returns scholarships most similar to the given row by description embedding
// cosine similarity. Rows whose embedding is null are silently skipped by the
// RPC; if the source row itself has no embedding the response is { items: [] }.
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const rawLimit = Number(new URL(request.url).searchParams.get("limit") ?? "10");
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(1, Math.trunc(rawLimit)), 50) : 10;

  const db = createBrowserClient();

  const { data: matches, error: rpcError } = await db.rpc("match_similar_to_scholarship", {
    p_id: id,
    p_match_count: limit,
    p_min_similarity: 0,
  });

  if (rpcError) {
    return NextResponse.json({ error: rpcError.message }, { status: 500 });
  }

  const rows = (matches ?? []) as SimilarMatch[];
  if (rows.length === 0) {
    return NextResponse.json({ items: [] satisfies SimilarScholarship[] });
  }

  const ids = rows.map((r) => r.id);
  const { data: joined, error: rowsError } = await db
    .from("scholarships")
    .select(SCHOLARSHIP_SELECT)
    .in("id", ids);
  if (rowsError) {
    return NextResponse.json({ error: rowsError.message }, { status: 500 });
  }

  // Preserve RPC ordering (in() loses it) and attach the similarity score.
  const byId = new Map<string, ScholarshipJoinedRow>(
    (joined as unknown as ScholarshipJoinedRow[]).map((r) => [r.id, r]),
  );
  const items: SimilarScholarship[] = [];
  for (const r of rows) {
    const row = byId.get(r.id);
    if (!row) continue;
    items.push({ ...rowToScholarship(row), similarity: r.similarity });
  }

  return NextResponse.json({ items });
}
