import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

const USER_GATED = ["/counselor", "/evaluator", "/alumni"];
const ADMIN_GATED = ["/admin"];

export async function middleware(request: NextRequest) {
  const { response, user, isAdmin } = await updateSession(request);
  const path = request.nextUrl.pathname;

  const needsUser = USER_GATED.some((p) => path === p || path.startsWith(`${p}/`));
  const needsAdmin = ADMIN_GATED.some((p) => path === p || path.startsWith(`${p}/`));

  if ((needsUser || needsAdmin) && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  if (needsAdmin && !isAdmin) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/scholarships|api/acceptance-rate|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
