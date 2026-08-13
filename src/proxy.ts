import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/session";
import { CASHIER_SESSION_COOKIE } from "@/lib/cashier-session";

// Optimistic check only — presence of the cookie, nothing more. Proxy runs on
// every request (including prefetches) and per Next's own auth guidance should
// not hit the database. Real verification (expiry, revocation, active user)
// happens in the DAL (src/lib/session.ts) from layouts, and in requireAuth()
// (src/lib/api-auth.ts) from every API route handler — never trust proxy alone.
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/cashier")) {
    const hasCashierSession = Boolean(request.cookies.get(CASHIER_SESSION_COOKIE));
    const isCashierLogin = pathname === "/cashier/login";

    if (!hasCashierSession && !isCashierLogin) {
      return NextResponse.redirect(new URL("/cashier/login", request.url));
    }
    if (hasCashierSession && isCashierLogin) {
      // Sales reconciliation is the primary daily-use feature; deposits
      // (verify.et) is on hold for now — see /cashier/deposits.
      return NextResponse.redirect(new URL("/cashier/sales", request.url));
    }
    return NextResponse.next();
  }

  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE));
  const isLogin = pathname === "/login";

  if (!hasSession && !isLogin) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (hasSession && isLogin) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/login", "/cashier/:path*"],
};
