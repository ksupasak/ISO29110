import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Optimistic gate only: real validation happens in requireUser().
export function proxy(request: NextRequest) {
  if (!request.cookies.has("esm_session")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!login|api/files/|api/templates/|api/meetings/|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
