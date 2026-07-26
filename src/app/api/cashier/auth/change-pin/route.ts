// src/app/api/cashier/auth/change-pin/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCashierAuth } from "@/lib/cashier-auth";
import { badRequest, ok, serverError } from "@/lib/api-utils";
import { cashierChangePinSchema } from "@/lib/schemas/cashier";
import { verifyPin, hashPin } from "@/lib/pin";

export async function POST(request: NextRequest) {
  const auth = await requireCashierAuth(request);
  if ("error" in auth) return auth.error;

  try {
    const body = await request.json();
    const parsed = cashierChangePinSchema.safeParse(body);
    if (!parsed.success) return badRequest("Invalid request body.", parsed.error.flatten());

    const employee = await prisma.employee.findUnique({ where: { id: auth.session.employeeId } });
    if (!employee?.cashierPinHash) return badRequest("No PIN is set on this account yet.");

    const matches = await verifyPin(parsed.data.currentPin, employee.cashierPinHash);
    if (!matches) return badRequest("Current PIN is incorrect.");

    const pinHash = await hashPin(parsed.data.newPin);
    await prisma.employee.update({
      where: { id: employee.id },
      data: { cashierPinHash: pinHash, cashierPinSetAt: new Date(), cashierPinAttempts: 0, cashierPinLockedUntil: null },
    });

    return ok({ message: "PIN updated." });
  } catch (error) {
    return serverError(error);
  }
}
