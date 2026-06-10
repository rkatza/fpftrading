import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

/**
 * Next 16 proxy (the middleware successor): every route requires a session
 * except the login page, auth endpoints, and cron routes (which enforce
 * CRON_SECRET themselves).
 */
export const proxy = auth((req) => {
  const { pathname } = req.nextUrl;
  const isPublic =
    pathname === "/login" || pathname.startsWith("/api/auth") || pathname.startsWith("/api/cron");
  if (!req.auth && !isPublic) {
    const url = new URL("/login", req.nextUrl);
    if (pathname !== "/") url.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|ico)$).*)"],
};
