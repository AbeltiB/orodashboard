// src/lib/api-auth.ts
import type { NextRequest } from "next/server";
import type { $Enums } from "@/generated/prisma/client";
import { getSessionByToken, SESSION_COOKIE, type AuthSession } from "./session";
import { forbidden, unauthorized } from "./api-utils";
import { hasPermission, type PermissionPage } from "./permissions";

export type AuthResult = { error: Response } | { session: AuthSession };

/**
 * Verifies the session cookie against the database (never trusts src/proxy.ts's
 * optimistic cookie-presence check alone — see src/proxy.ts for why). Every API
 * route handler must call this itself.
 */
export async function requireAuth(request: NextRequest): Promise<AuthResult> {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    return { error: unauthorized("Missing authentication token.") };
  }

  const session = await getSessionByToken(token);
  if (!session) {
    return { error: unauthorized("Invalid or expired session.") };
  }

  return { session };
}

export async function requireRole(
  request: NextRequest,
  roles: $Enums.AdminRole[]
): Promise<AuthResult> {
  const auth = await requireAuth(request);
  if ("error" in auth) return auth;

  if (!roles.includes(auth.session.role)) {
    return { error: forbidden("You do not have permission to perform this action.") };
  }

  return auth;
}

export async function requirePermission(
  request: NextRequest,
  page: PermissionPage,
  action: "view" | "edit"
): Promise<AuthResult> {
  const auth = await requireAuth(request);
  if ("error" in auth) return auth;

  // Super admins implicitly have full access regardless of their permissions blob.
  if (auth.session.role !== "SUPER_ADMIN" && !hasPermission(auth.session.permissions, page, action)) {
    return { error: forbidden(`You do not have ${action} access to ${page}.`) };
  }

  return auth;
}
