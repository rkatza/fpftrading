import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";

/**
 * Next 16 proxy (the middleware successor): every route requires a session
 * except the login page, auth endpoints, and cron routes (which enforce
 * CRON_SECRET themselves).
 *
 * When required env vars are missing (fresh deploy), short-circuit to /setup
 * instead of letting NextAuth/Prisma throw a bare 500.
 */
const REQUIRED_ENV = ["DATABASE_URL", "AUTH_SECRET", "AUTH_PASSWORD"] as const;

const authProxy = auth((req) => {
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

export function proxy(req: NextRequest, ctx: unknown) {
  const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    if (req.nextUrl.pathname === "/setup") return NextResponse.next();
    return NextResponse.redirect(new URL("/setup", req.nextUrl));
  }
  if (req.nextUrl.pathname === "/setup") {
    return NextResponse.redirect(new URL("/", req.nextUrl));
  }
  return (authProxy as unknown as (req: NextRequest, ctx: unknown) => Response | Promise<Response>)(req, ctx);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|ico)$).*)"],
};
