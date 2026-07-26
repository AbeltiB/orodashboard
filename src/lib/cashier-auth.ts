// src/lib/cashier-auth.ts
// Mirrors src/lib/api-auth.ts — every cashier API route handler must call
// requireCashierAuth() itself, never trust proxy's cookie-presence check alone.
import type { NextRequest } from "next/server";
import { getCashierSessionByToken, CASHIER_SESSION_COOKIE, type CashierAuthSession } from "./cashier-session";
import { unauthorized } from "./api-utils";

export type CashierAuthResult = { error: Response } | { session: CashierAuthSession };

export async function requireCashierAuth(request: NextRequest): Promise<CashierAuthResult> {
  const token = request.cookies.get(CASHIER_SESSION_COOKIE)?.value;
  if (!token) {
    return { error: unauthorized("Missing authentication token.") };
  }

  const session = await getCashierSessionByToken(token);
  if (!session) {
    return { error: unauthorized("Invalid or expired session.") };
  }

  return { session };
}
