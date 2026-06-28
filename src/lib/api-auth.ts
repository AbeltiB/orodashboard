import type { NextRequest } from "next/server";

/**
 * Dummy auth guard.
 *
 * The middleware already redirects page requests without a `token` cookie.
 * This guard gives API routes the same check so they return 401 instead of
 * running as an unauthenticated user. It will be replaced with real ABAC
 * auth once that system is built.
 */
export function requireAuth(request: NextRequest): Response | null {
  const token = request.cookies.get("token")?.value;

  if (!token) {
    return Response.json(
      { error: "Unauthorized", message: "Missing authentication token." },
      { status: 401 }
    );
  }

  return null;
}
