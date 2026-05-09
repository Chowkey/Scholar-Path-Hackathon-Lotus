import { NextResponse, type NextRequest } from "next/server";
import { listSavedIds, setSaved } from "@/lib/saved-scholarships";
import { createServerClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const ids = await listSavedIds(supabase, user.id);
  return NextResponse.json({ ids });
}

export async function POST(request: NextRequest) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as
    | { scholarshipId?: string; saved?: boolean }
    | null;
  if (!body?.scholarshipId || typeof body.saved !== "boolean") {
    return NextResponse.json({ error: "scholarshipId and saved are required" }, { status: 400 });
  }

  await setSaved(supabase, user.id, body.scholarshipId, body.saved);
  return NextResponse.json({ saved: body.saved });
}
