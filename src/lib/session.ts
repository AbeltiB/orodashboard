// src/lib/session.ts
import crypto from "crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { prisma } from "./prisma";
import type { $Enums } from "@/generated/prisma/client";

export const SESSION_COOKIE = "oro_session";
export const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // fixed 7 days, never slides

export type AuthSession = {
  sessionId: string;
  adminUserId: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  phone: string;
  role: $Enums.AdminRole;
  permissions: unknown;
};

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export async function createSession(
  adminUserId: string,
  meta: { userAgent?: string | null; ipAddress?: string | null } = {}
): Promise<{ token: string; expiresAt: Date }> {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  await prisma.session.create({
    data: {
      adminUserId,
      tokenHash: hashToken(token),
      expiresAt,
      userAgent: meta.userAgent ?? null,
      ipAddress: meta.ipAddress ?? null,
    },
  });

  return { token, expiresAt };
}

// Core session verification — shared by the API-route DAL (src/lib/api-auth.ts,
// which reads the token off NextRequest synchronously) and getSession() below
// (which reads it via the async next/headers cookies() API for server components).
export async function getSessionByToken(token: string): Promise<AuthSession | null> {
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { adminUser: true },
  });

  if (!session) return null;
  if (session.revokedAt) return null;
  if (session.expiresAt < new Date()) return null;
  if (!session.adminUser.isActive) return null;

  // Best-effort activity timestamp — never block the request on this.
  prisma.session
    .update({ where: { id: session.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  const { adminUser } = session;
  return {
    sessionId: session.id,
    adminUserId: adminUser.id,
    firstName: adminUser.firstName,
    middleName: adminUser.middleName,
    lastName: adminUser.lastName,
    phone: adminUser.phone,
    role: adminUser.role,
    permissions: adminUser.permissions,
  };
}

// Server-component DAL — cached per request so layouts/pages can call this
// freely without re-querying. Optimistic checks only happen in src/proxy.ts;
// this is the actual source of truth.
export const getSession = cache(async (): Promise<AuthSession | null> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return getSessionByToken(token);
});

export async function revokeSession(sessionId: string): Promise<void> {
  await prisma.session
    .update({ where: { id: sessionId }, data: { revokedAt: new Date() } })
    .catch(() => {});
}

// Revokes every active session for an admin — used when deactivating/deleting
// an account so an already-logged-in session can't keep working.
export async function revokeAllSessionsForUser(adminUserId: string): Promise<void> {
  await prisma.session.updateMany({
    where: { adminUserId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
