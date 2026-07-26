// src/lib/cashier-session.ts
// Mirrors src/lib/session.ts one-to-one, but for the cashier deposit portal
// (Employee-backed, PIN-only sign-in) — deliberately kept separate from the
// AdminUser/Session world so cashier accounts can never be confused with
// admin dashboard access.
import crypto from "crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { prisma } from "./prisma";

export const CASHIER_SESSION_COOKIE = "oro_cashier_session";
export const CASHIER_SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // fixed 7 days, never slides

export type CashierAuthSession = {
  sessionId: string;
  employeeId: string;
  code: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  phone: string;
};

export function hashCashierToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function generateCashierSessionToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export async function createCashierSession(
  employeeId: string,
  meta: { userAgent?: string | null; ipAddress?: string | null } = {}
): Promise<{ token: string; expiresAt: Date }> {
  const token = generateCashierSessionToken();
  const expiresAt = new Date(Date.now() + CASHIER_SESSION_DURATION_MS);

  await prisma.cashierSession.create({
    data: {
      employeeId,
      tokenHash: hashCashierToken(token),
      expiresAt,
      userAgent: meta.userAgent ?? null,
      ipAddress: meta.ipAddress ?? null,
    },
  });

  return { token, expiresAt };
}

export async function getCashierSessionByToken(token: string): Promise<CashierAuthSession | null> {
  const session = await prisma.cashierSession.findUnique({
    where: { tokenHash: hashCashierToken(token) },
    include: { employee: true },
  });

  if (!session) return null;
  if (session.revokedAt) return null;
  if (session.expiresAt < new Date()) return null;
  if (session.employee.isDeleted) return null;

  prisma.cashierSession
    .update({ where: { id: session.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  const { employee } = session;
  return {
    sessionId: session.id,
    employeeId: employee.id,
    code: employee.code,
    firstName: employee.firstName,
    middleName: employee.middleName,
    lastName: employee.lastName,
    phone: employee.phone,
  };
}

export const getCashierSession = cache(async (): Promise<CashierAuthSession | null> => {
  const store = await cookies();
  const token = store.get(CASHIER_SESSION_COOKIE)?.value;
  if (!token) return null;
  return getCashierSessionByToken(token);
});

export async function revokeCashierSession(sessionId: string): Promise<void> {
  await prisma.cashierSession
    .update({ where: { id: sessionId }, data: { revokedAt: new Date() } })
    .catch(() => {});
}

export async function revokeAllCashierSessionsForEmployee(employeeId: string): Promise<void> {
  await prisma.cashierSession.updateMany({
    where: { employeeId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
