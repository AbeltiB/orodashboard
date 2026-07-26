// src/lib/device.ts
// A "trusted device" is a browser that's already proven itself via a full
// OTP sign-in once — it can then use the faster PIN sign-in instead of
// asking for OTP again. Deliberately mirrors session.ts's token/cookie
// pattern (raw token only ever lives in the cookie; only its hash is
// stored), but is a separate, much longer-lived cookie — "trusted" and
// "currently signed in" are different concepts.
import crypto from "crypto";
import { prisma } from "./prisma";

export const DEVICE_COOKIE = "oro_device";
export const DEVICE_DURATION_MS = 180 * 24 * 60 * 60 * 1000; // fixed 180 days, never slides

export function hashDeviceToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function generateDeviceToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export async function createTrustedDevice(
  adminUserId: string,
  meta: { userAgent?: string | null; ipAddress?: string | null } = {}
): Promise<{ token: string; expiresAt: Date }> {
  const token = generateDeviceToken();
  const expiresAt = new Date(Date.now() + DEVICE_DURATION_MS);

  await prisma.trustedDevice.create({
    data: {
      adminUserId,
      tokenHash: hashDeviceToken(token),
      expiresAt,
      userAgent: meta.userAgent ?? null,
      ipAddress: meta.ipAddress ?? null,
    },
  });

  return { token, expiresAt };
}

// Resolves a device cookie to the admin it belongs to, or null if the
// cookie is missing/unknown/revoked/expired, or the admin is inactive.
export async function getTrustedDeviceAdminId(token: string): Promise<string | null> {
  const device = await prisma.trustedDevice.findUnique({
    where: { tokenHash: hashDeviceToken(token) },
    include: { adminUser: { select: { isActive: true } } },
  });

  if (!device) return null;
  if (device.revokedAt) return null;
  if (device.expiresAt < new Date()) return null;
  if (!device.adminUser.isActive) return null;

  // Best-effort activity timestamp — never block the request on this.
  prisma.trustedDevice
    .update({ where: { id: device.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  return device.adminUserId;
}

// Revokes every trusted device for an admin — used when deactivating/deleting
// an account, and available later as a "forget all devices" self-service action.
export async function revokeAllTrustedDevicesForUser(adminUserId: string): Promise<void> {
  await prisma.trustedDevice.updateMany({
    where: { adminUserId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
