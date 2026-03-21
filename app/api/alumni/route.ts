import { NextResponse } from "next/server";
import { findAlumniMatches } from "@/lib/alumni";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { dreamUniversity, fieldOfStudy, nationality, currentSchool, limit = 5 } = body;

    if (!dreamUniversity) {
      return NextResponse.json({ error: "dreamUniversity is required." }, { status: 400 });
    }

    const result = await findAlumniMatches({
      dreamUniversity,
      user: {
        fieldOfStudy,
        nationality,
        currentSchool,
      },
      limit
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Alumni API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
