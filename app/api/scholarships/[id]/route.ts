import { NextRequest, NextResponse } from "next/server";
import { createBrowserClient, createServiceClient } from "@/lib/supabase";
import { upsertScholarshipNormalized } from "@/lib/scholarshipNormalizedWriter";
import {
  rowToScholarship,
  SCHOLARSHIP_SELECT,
  type ScholarshipJoinedRow,
} from "@/lib/scholarshipTransform";
import type { Scholarship } from "@/lib/types";

type RouteContext = {
  params: Promise<{ id: string }>;
};

// GET /api/scholarships/[id]
export async function GET(_request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const db = createBrowserClient();
  const { data, error } = await db
    .from("scholarships")
    .select(SCHOLARSHIP_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Scholarship not found." }, { status: 404 });
  }

  return NextResponse.json(rowToScholarship(data as unknown as ScholarshipJoinedRow));
}

// PUT /api/scholarships/[id] — re-runs the normalized upsert with the new payload
export async function PUT(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  let body: Partial<Scholarship>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const db = createServiceClient();

  const { data: existing, error: fetchError } = await db
    .from("scholarships")
    .select(SCHOLARSHIP_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: "Scholarship not found." }, { status: 404 });
  }

  const merged: Scholarship = {
    ...rowToScholarship(existing as unknown as ScholarshipJoinedRow),
    ...body,
  };

  try {
    await upsertScholarshipNormalized(db, merged, id);
    const { data: updated, error: refetchError } = await db
      .from("scholarships")
      .select(SCHOLARSHIP_SELECT)
      .eq("id", id)
      .single();
    if (refetchError) throw refetchError;
    return NextResponse.json(
      rowToScholarship(updated as unknown as ScholarshipJoinedRow),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Update failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE /api/scholarships/[id]
export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const db = createServiceClient();
  const { error } = await db.from("scholarships").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
