import { NextRequest, NextResponse } from "next/server";
import { createBrowserClient, createServiceClient } from "@/lib/supabase";
import {
  rowToScholarship,
  scholarshipToRow,
  type ScholarshipRow,
} from "@/lib/scholarshipTransform";
import type { Scholarship } from "@/lib/types";

type RouteContext = {
  params: {
    id: string;
  };
};

// GET /api/scholarships/[id]
export async function GET(_request: NextRequest, { params }: RouteContext) {
  const db = createBrowserClient();
  const { data, error } = await db
    .from("scholarships")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Scholarship not found." }, { status: 404 });
  }

  return NextResponse.json(rowToScholarship(data as ScholarshipRow));
}

// PUT /api/scholarships/[id]
export async function PUT(request: NextRequest, { params }: RouteContext) {
  let body: Partial<Scholarship>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const db = createServiceClient();

  const updatePayload: Partial<Scholarship> = { ...body, id: params.id };
  const converted = scholarshipToRow(updatePayload as Scholarship);
  const row: Partial<ScholarshipRow> = {};

  if (typeof body.name === "string") row.name = converted.name;
  if (typeof body.country === "string") row.country = converted.country;
  if (typeof body.flag === "string") row.flag = converted.flag;
  if (typeof body.organization === "string") row.organization = converted.organization;
  if (typeof body.degree === "string") row.degree = converted.degree;
  if (typeof body.funding === "string") row.funding = converted.funding;
  if (typeof body.field === "string") row.field_of_study = converted.field_of_study;
  if (typeof body.academicRequirements === "string") {
    row.academic_requirements = converted.academic_requirements;
  }
  if (typeof body.languageRequirements === "object") {
    row.language_requirements = converted.language_requirements;
  }
  if (typeof body.otherRequirements === "string") {
    row.other_requirements = converted.other_requirements;
  }
  if (typeof body.deadline === "string") row.deadline = converted.deadline;
  if (typeof body.description === "string") row.description = converted.description;
  if (typeof body.link === "string") row.link = converted.link;
  if (typeof body.sourceName === "string") row.source_name = converted.source_name;
  if (typeof body.sourceUrl === "string") row.source_url = converted.source_url;

  if (Object.keys(row).length === 0) {
    return NextResponse.json({ error: "No updatable fields were provided." }, { status: 400 });
  }

  const { data, error } = await db
    .from("scholarships")
    .update(row)
    .eq("id", params.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Scholarship not found." }, { status: 404 });
  }

  return NextResponse.json(rowToScholarship(data as ScholarshipRow));
}

// DELETE /api/scholarships/[id]
export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const db = createServiceClient();
  const { error } = await db.from("scholarships").delete().eq("id", params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
