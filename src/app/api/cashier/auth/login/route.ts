// src/app/api/cashier/auth/login/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, notFound, serverError } from "@/lib/api-utils";
import { cashierLoginSchema } from "@/lib/schemas/cashier";
import { verifyPin } from "@/lib/pin";
import { PIN_MAX_ATTEMPTS, PIN_LOCKOUT_MINUTES } from "@/lib/pin-constants";
import { createCashierSession, CASHIER_SESSION_COOKIE } from "@/lib/cashier-session";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = cashierLoginSchema.safeParse(body);
    if (!parsed.success) return badRequest("Invalid request body.", parsed.error.flatten());

    const { phone, pin } = parsed.data;

    const employee = await prisma.employee.findUnique({ where: { phone } });
    if (!employee || employee.isDeleted) {
      return notFound("This phone number isn't registered as a cashier. Contact your administrator.");
    }
    if (!employee.cashierPinHash) {
      return badRequest("A PIN hasn't been set up for this account yet. Contact your administrator.");
    }
    if (employee.cashierPinLockedUntil && employee.cashierPinLockedUntil > new Date()) {
      return Response.json(
        {
          error: "Locked",
          message: "Too many incorrect attempts. Try again later.",
          lockedUntil: employee.cashierPinLockedUntil,
        },
        { status: 423 }
      );
    }

    const matches = await verifyPin(pin, employee.cashierPinHash);
    if (!matches) {
      const attempts = employee.cashierPinAttempts + 1;
      const lockingOut = attempts >= PIN_MAX_ATTEMPTS;

      await prisma.employee.update({
        where: { id: employee.id },
        data: {
          cashierPinAttempts: attempts,
          cashierPinLockedUntil: lockingOut ? new Date(Date.now() + PIN_LOCKOUT_MINUTES * 60 * 1000) : undefined,
        },
      });

      if (lockingOut) {
        return Response.json(
          {
            error: "Locked",
            message: "Too many incorrect attempts. Account locked.",
            lockedUntil: new Date(Date.now() + PIN_LOCKOUT_MINUTES * 60 * 1000),
          },
          { status: 423 }
        );
      }

      return badRequest(`Incorrect PIN. ${PIN_MAX_ATTEMPTS - attempts} attempt(s) remaining.`);
    }

    await prisma.employee.update({
      where: { id: employee.id },
      data: { cashierPinAttempts: 0, cashierPinLockedUntil: null },
    });

    const meta = {
      userAgent: request.headers.get("user-agent"),
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    };
    const { token, expiresAt } = await createCashierSession(employee.id, meta);

    const res = NextResponse.json({ message: "Signed in." }, { status: 200 });
    res.cookies.set(CASHIER_SESSION_COOKIE, token, {
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
