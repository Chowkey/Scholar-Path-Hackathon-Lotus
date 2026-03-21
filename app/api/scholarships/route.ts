import { NextRequest, NextResponse } from "next/server";
import { createBrowserClient, createServiceClient } from "@/lib/supabase";
import {
  rowToScholarship,
  scholarshipToRow,
  type ScholarshipRow,
} from "@/lib/scholarshipTransform";
import type { Scholarship } from "@/lib/types";

function normalizeFilter(value: string | null): string {
  return (value ?? "").trim();
}

// GET /api/scholarships
// Supports optional query params: ?country=&degree=&funding=&query=
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const country = normalizeFilter(
    searchParams.get("country") ?? searchParams.get("region")
  );
  const degree = normalizeFilter(searchParams.get("degree"));
  const funding = normalizeFilter(searchParams.get("funding"));
  const query = normalizeFilter(searchParams.get("query")).toLowerCase();

  const db = createBrowserClient();
  let statement = db
    .from("scholarships")
    .select("*")
    .order("created_at", { ascending: false });

  if (country && country !== "All") {
    statement = statement.eq("country", country);
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

  let scholarships = (data ?? []).map((row) =>
    rowToScholarship(row as ScholarshipRow)
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
        .includes(query)
    );
  }

  return NextResponse.json(scholarships);
}

// POST /api/scholarships
export async function POST(request: NextRequest) {
  let body: Scholarship;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (
    !body.id ||
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
          "id, name, country, organization, degree, deadline, and link are required.",
      },
      { status: 400 }
    );
  }

  const db = createServiceClient();
  const row = scholarshipToRow(body);
  const { data, error } = await db.from("scholarships").insert(row).select().single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(rowToScholarship(data as ScholarshipRow), { status: 201 });
}
