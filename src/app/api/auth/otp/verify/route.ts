// src/app/api/auth/otp/verify/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, notFound, serverError } from "@/lib/api-utils";
import { verifyOtpSchema } from "@/lib/schemas/auth";
import { verifyPin } from "@/lib/pin";
import { OTP_MAX_ATTEMPTS, OTP_LOCKOUT_MINUTES } from "@/lib/otp";
import { createSession, SESSION_COOKIE } from "@/lib/session";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = verifyOtpSchema.safeParse(body);
    if (!parsed.success) return badRequest("Invalid request body.", parsed.error.flatten());

    const { phone, otp } = parsed.data;

    const admin = await prisma.adminUser.findUnique({ where: { phone } });
    if (!admin) {
      return notFound("This phone number is not registered. Contact your administrator.");
    }
    if (!admin.isActive) {
      return badRequest("This account has been deactivated. Contact your administrator.");
    }
    if (admin.lockedUntil && admin.lockedUntil > new Date()) {
      return Response.json(
        {
          error: "Locked",
          message: "Account locked due to too many failed attempts.",
          lockedUntil: admin.lockedUntil,
        },
        { status: 423 }
      );
    }
    if (!admin.otpCodeHash || !admin.otpExpiresAt || admin.otpExpiresAt < new Date()) {
      return badRequest("Code expired or not requested. Please request a new one.");
    }

    const matches = await verifyPin(otp, admin.otpCodeHash);
    if (!matches) {
      const attempts = admin.otpAttempts + 1;
      const lockingOut = attempts >= OTP_MAX_ATTEMPTS;

      await prisma.adminUser.update({
        where: { id: admin.id },
        data: {
          otpAttempts: attempts,
          lockedUntil: lockingOut
            ? new Date(Date.now() + OTP_LOCKOUT_MINUTES * 60 * 1000)
            : undefined,
        },
      });

      if (lockingOut) {
        return Response.json(
          {
            error: "Locked",
            message: "Too many incorrect attempts. Account locked.",
            lockedUntil: new Date(Date.now() + OTP_LOCKOUT_MINUTES * 60 * 1000),
          },
          { status: 423 }
        );
      }

      return badRequest(
        `Incorrect code. ${OTP_MAX_ATTEMPTS - attempts} attempt(s) remaining.`
      );
    }

    await prisma.adminUser.update({
      where: { id: admin.id },
      data: {
        otpCodeHash: null,
        otpExpiresAt: null,
        otpAttempts: 0,
        otpRequestedAt: null,
        lockedUntil: null,
        lastLoginAt: new Date(),
      },
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
