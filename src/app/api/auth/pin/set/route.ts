// src/app/api/auth/pin/set/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-auth";
import { badRequest, ok, serverError } from "@/lib/api-utils";
import { setPinSchema } from "@/lib/schemas/auth";
import { hashPin } from "@/lib/pin";

/**
 * POST /api/auth/pin/set
 * Sets (or changes) the current admin's PIN. Used right after a first OTP
 * sign-in, after a "forgot PIN" OTP re-verification, and from Settings.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if ("error" in auth) return auth.error;

  try {
    const body = await request.json();
    const parsed = setPinSchema.safeParse(body);
    if (!parsed.success) return badRequest("Invalid request body.", parsed.error.flatten());

    const pinHash = await hashPin(parsed.data.pin);

    await prisma.adminUser.update({
      where: { id: auth.session.adminUserId },
      data: { pinHash, pinSetAt: new Date(), pinAttempts: 0, pinLockedUntil: null },
    });

    return ok({ message: "PIN saved." });
  } catch (error) {
    return serverError(error);
  }
}
