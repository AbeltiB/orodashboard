// src/app/api/auth/login/start/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, notFound, ok, serverError } from "@/lib/api-utils";
import { loginStartSchema } from "@/lib/schemas/auth";
import { hashPin } from "@/lib/pin";
import { generateOtpCode, otpSender, OTP_EXPIRY_MINUTES, OTP_RESEND_COOLDOWN_SECONDS } from "@/lib/otp";
import { DEVICE_COOKIE, getTrustedDeviceAdminId } from "@/lib/device";

/**
 * POST /api/auth/login/start
 * First call the login page makes with just a phone number. Decides
 * between the two sign-in paths:
 *  - "pin": this browser already proved itself via OTP once (has a valid
 *    oro_device cookie for this exact admin) and the admin has a PIN set —
 *    no OTP is sent, the login page goes straight to PIN entry.
 *  - "otp": everyone else (first-ever login, new device, no PIN set yet,
 *    or PIN temporarily locked out) — behaves exactly like the existing
 *    /api/auth/otp/send.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = loginStartSchema.safeParse(body);
    if (!parsed.success) return badRequest("Invalid request body.", parsed.error.flatten());

    const { phone } = parsed.data;

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

    const deviceToken = request.cookies.get(DEVICE_COOKIE)?.value;
    const pinLocked = admin.pinLockedUntil && admin.pinLockedUntil > new Date();
    if (deviceToken && admin.pinHash && !pinLocked) {
      const trustedAdminId = await getTrustedDeviceAdminId(deviceToken);
      if (trustedAdminId === admin.id) {
        return ok({ method: "pin" as const });
      }
    }

    // Same resend-cooldown + send logic as /api/auth/otp/send.
    if (
      admin.otpRequestedAt &&
      Date.now() - admin.otpRequestedAt.getTime() < OTP_RESEND_COOLDOWN_SECONDS * 1000
    ) {
      return Response.json(
        { error: "Too Many Requests", message: "Please wait before requesting another code." },
        { status: 429 }
      );
    }

    const code = generateOtpCode();
    const otpCodeHash = await hashPin(code);
    const otpExpiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    await prisma.adminUser.update({
      where: { id: admin.id },
      data: { otpCodeHash, otpExpiresAt, otpAttempts: 0, otpRequestedAt: new Date() },
    });

    await otpSender.send(phone, code);

    return ok({
      method: "otp" as const,
      message: "A 6-digit code was sent.",
      ...(process.env.NODE_ENV !== "production" ? { devCode: code } : {}),
    });
  } catch (error) {
    return serverError(error);
  }
}
