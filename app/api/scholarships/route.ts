import { NextRequest, NextResponse } from "next/server";
import { createBrowserClient, createServiceClient } from "@/lib/supabase";
import { upsertScholarshipNormalized } from "@/lib/scholarshipNormalizedWriter";
import {
  rowToScholarship,
  SCHOLARSHIP_SELECT,
  type ScholarshipJoinedRow,
} from "@/lib/scholarshipTransform";
import type { Scholarship } from "@/lib/types";

function normalizeFilter(value: string | null): string {
  return (value ?? "").trim();
}

// GET /api/scholarships?country=&degree=&funding=&query=
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const country = normalizeFilter(
    searchParams.get("country") ?? searchParams.get("region"),
  );
  const degree = normalizeFilter(searchParams.get("degree"));
  const funding = normalizeFilter(searchParams.get("funding"));
  const query = normalizeFilter(searchParams.get("query")).toLowerCase();

  const db = createBrowserClient();
  let statement = db
    .from("scholarships")
    .select(SCHOLARSHIP_SELECT)
    .order("created_at", { ascending: false });

  if (country && country !== "All") {
    statement = statement.eq("country.name", country);
  }
  if (degree && degree !== "All") {
    statement = statement.eq("degree", degree);
  }
  if (funding && funding !== "All") {
    statement = statement.ilike("funding", `%${funding}%`);
  }

  const { data, error } = await statement;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let scholarships = ((data ?? []) as unknown as ScholarshipJoinedRow[]).map(
    rowToScholarship,
  );

  if (query) {
    scholarships = scholarships.filter((item) =>
      [
        item.name,
        item.country,
        item.organization,
        item.degree,
        item.funding,
        item.field,
        item.description,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }

  return NextResponse.json(scholarships);
}

// POST /api/scholarships — insert via the normalized writer (admin only via service role)
export async function POST(request: NextRequest) {
  let body: Scholarship;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (
    !body.name ||
    !body.country ||
    !body.organization ||
    !body.degree ||
    !body.deadline ||
    !body.link
  ) {
    return NextResponse.json(
      {
        error:
          "name, country, organization, degree, deadline, and link are required.",
      },
      { status: 400 },
    );
  }

  try {
    const db = createServiceClient();
    const id = await upsertScholarshipNormalized(db, body);

    const { data, error } = await db
      .from("scholarships")
      .select(SCHOLARSHIP_SELECT)
      .eq("id", id)
      .single();
    if (error) throw error;

    return NextResponse.json(
      rowToScholarship(data as unknown as ScholarshipJoinedRow),
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Insert failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
