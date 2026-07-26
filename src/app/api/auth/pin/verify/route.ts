// src/app/api/auth/pin/verify/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, notFound, serverError } from "@/lib/api-utils";
import { verifyPinSchema } from "@/lib/schemas/auth";
import { verifyPin } from "@/lib/pin";
import { PIN_MAX_ATTEMPTS, PIN_LOCKOUT_MINUTES } from "@/lib/pin-constants";
import { createSession, SESSION_COOKIE } from "@/lib/session";
import { DEVICE_COOKIE, getTrustedDeviceAdminId } from "@/lib/device";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = verifyPinSchema.safeParse(body);
    if (!parsed.success) return badRequest("Invalid request body.", parsed.error.flatten());

    const { phone, pin } = parsed.data;

    const admin = await prisma.adminUser.findUnique({ where: { phone } });
    if (!admin) {
      return notFound("This phone number is not registered. Contact your administrator.");
    }
    if (!admin.isActive) {
      return badRequest("This account has been deactivated. Contact your administrator.");
    }
    if (admin.lockedUntil && admin.lockedUntil > new Date()) {
      return Response.json(
        { error: "Locked", message: "Account locked due to too many failed attempts.", lockedUntil: admin.lockedUntil },
        { status: 423 }
      );
    }

    // PIN sign-in only ever works from a browser that's already proven
    // itself via OTP — never allows guessing a PIN for an arbitrary phone
    // number from a device that's never seen that admin.
    const deviceToken = request.cookies.get(DEVICE_COOKIE)?.value;
    const trustedAdminId = deviceToken ? await getTrustedDeviceAdminId(deviceToken) : null;
    if (trustedAdminId !== admin.id) {
      return badRequest("PIN sign-in isn't available on this device. Use OTP instead.");
    }

    if (admin.pinLockedUntil && admin.pinLockedUntil > new Date()) {
      return Response.json(
        {
          error: "Locked",
          message: "Too many incorrect PIN attempts. Use OTP instead, or try your PIN again later.",
          pinLockedUntil: admin.pinLockedUntil,
        },
        { status: 423 }
      );
    }
    if (!admin.pinHash) {
      return badRequest("No PIN is set up for this account. Use OTP instead.");
    }

    const matches = await verifyPin(pin, admin.pinHash);
    if (!matches) {
      const attempts = admin.pinAttempts + 1;
      const lockingOut = attempts >= PIN_MAX_ATTEMPTS;
      const pinLockedUntil = lockingOut ? new Date(Date.now() + PIN_LOCKOUT_MINUTES * 60 * 1000) : null;

      await prisma.adminUser.update({
        where: { id: admin.id },
        data: { pinAttempts: lockingOut ? 0 : attempts, pinLockedUntil: lockingOut ? pinLockedUntil : undefined },
      });

      if (lockingOut) {
        return Response.json(
          {
            error: "Locked",
            message: "Too many incorrect PIN attempts. Use OTP instead, or try your PIN again later.",
            pinLockedUntil,
          },
          { status: 423 }
        );
      }

      return badRequest(`Incorrect PIN. ${PIN_MAX_ATTEMPTS - attempts} attempt(s) remaining.`);
    }

    await prisma.adminUser.update({
      where: { id: admin.id },
      data: { pinAttempts: 0, pinLockedUntil: null, lastLoginAt: new Date() },
    });

    const { token, expiresAt } = await createSession(admin.id, {
      userAgent: request.headers.get("user-agent"),
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    });

    const res = NextResponse.json({ message: "Signed in." }, { status: 200 });
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: expiresAt,
    });
    return res;
  } catch (error) {
    return serverError(error);
  }
}
