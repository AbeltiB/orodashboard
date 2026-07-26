// src/app/api/auth/pin/status/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-auth";
import { ok, serverError } from "@/lib/api-utils";

/**
 * GET /api/auth/pin/status
 * Whether the current admin has a PIN set — used by the Settings page's
 * "PIN sign-in" card. Never returns the hash itself.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if ("error" in auth) return auth.error;

  try {
    const admin = await prisma.adminUser.findUnique({
      where: { id: auth.session.adminUserId },
      select: { pinHash: true, pinSetAt: true },
    });

    return ok({ hasPinSet: !!admin?.pinHash, pinSetAt: admin?.pinSetAt ?? null });
  } catch (error) {
    return serverError(error);
  }
}
