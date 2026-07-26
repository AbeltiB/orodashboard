// src/app/api/cashiers/[employeeId]/pin/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/api-auth";
import { badRequest, notFound, ok, serverError } from "@/lib/api-utils";
import { cashierResetPinSchema } from "@/lib/schemas/cashier";
import { hashPin } from "@/lib/pin";
import { revokeAllCashierSessionsForEmployee } from "@/lib/cashier-session";

type Context = { params: Promise<{ employeeId: string }> };

/**
 * POST /api/cashiers/:employeeId/pin
 * Admin sets/resets a cashier's PIN — doesn't require knowing the old one.
 * Revokes any signed-in sessions on that account so a lost/stolen device
 * can't keep using the old PIN's session after a reset.
 */
export async function POST(request: NextRequest, context: Context) {
  const auth = await requirePermission(request, "cashiers", "edit");
  if ("error" in auth) return auth.error;

  try {
    const { employeeId } = await context.params;
    const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee || employee.isDeleted) return notFound("Employee");

    const body = await request.json();
    const parsed = cashierResetPinSchema.safeParse(body);
    if (!parsed.success) return badRequest("Invalid request body.", parsed.error.flatten());

    const pinHash = await hashPin(parsed.data.pin);
    await prisma.employee.update({
      where: { id: employeeId },
      data: { cashierPinHash: pinHash, cashierPinSetAt: new Date(), cashierPinAttempts: 0, cashierPinLockedUntil: null },
    });
    await revokeAllCashierSessionsForEmployee(employeeId);

    return ok({ message: "PIN set. Share it with the cashier directly — it won't be shown again." });
  } catch (error) {
    return serverError(error);
  }
}
