// src/app/api/auth/pin/clear/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-auth";
import { ok, serverError } from "@/lib/api-utils";

/**
 * POST /api/auth/pin/clear
 * Removes the current admin's PIN — falls back to always requiring OTP.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if ("error" in auth) return auth.error;

  try {
    await prisma.adminUser.update({
      where: { id: auth.session.adminUserId },
      data: { pinHash: null, pinSetAt: null, pinAttempts: 0, pinLockedUntil: null },
    });

    return ok({ message: "PIN removed." });
  } catch (error) {
    return serverError(error);
  }
}
