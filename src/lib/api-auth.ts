import type { NextRequest } from "next/server";

/**
 * Auth guard — temporarily disabled during development.
 *
 * The real implementation will validate a signed session token and enforce
 * ABAC rules once the auth system is built. For now every request is allowed
 * through so API routes can be tested without a login cookie.
 *
 * To re-enable: uncomment the token check below and delete the early return.
 */
export function requireAuth(request: NextRequest): Response | null {
  // ── DISABLED — restore before production ──────────────────────────────────
  void request; // suppress unused-variable warning
  return null;

  // ── RESTORE THIS WHEN AUTH IS READY ──────────────────────────────────────
  // const token = request.cookies.get("token")?.value;
  // if (!token) {
  //   return Response.json(
  //     { error: "Unauthorized", message: "Missing authentication token." },
  //     { status: 401 }
  //   );
  // }
  // return null;
}