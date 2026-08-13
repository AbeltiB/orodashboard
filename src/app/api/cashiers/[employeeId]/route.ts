// src/app/api/cashiers/[employeeId]/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/api-auth";
import { notFound, ok, serverError } from "@/lib/api-utils";
import { revokeAllCashierSessionsForEmployee } from "@/lib/cashier-session";

type Context = { params: Promise<{ employeeId: string }> };

/**
 * DELETE /api/cashiers/:employeeId
 * Fully removes an employee's cashier access — deactivates every station
 * and terminal assignment, clears the PIN, and revokes every signed-in
 * session. The underlying Employee record is untouched (still a valid HR
 * record); this only undoes "being a cashier", so re-assigning them and
 * setting a fresh PIN brings them right back if that was a mistake.
 */
export async function DELETE(request: NextRequest, context: Context) {
  const auth = await requirePermission(request, "cashiers", "edit");
  if ("error" in auth) return auth.error;

  try {
    const { employeeId } = await context.params;
    const employee = await prisma.employee.findUnique({ where: { id: employeeId }, select: { id: true, isDeleted: true } });
    if (!employee || employee.isDeleted) return notFound("Employee");

    await prisma.$transaction([
      prisma.cashierStationAssignment.updateMany({ where: { employeeId, isActive: true }, data: { isActive: false } }),
      prisma.cashierTerminalAssignment.updateMany({ where: { employeeId, isActive: true }, data: { isActive: false } }),
      prisma.employee.update({
        where: { id: employeeId },
        data: { cashierPinHash: null, cashierPinSetAt: null, cashierPinAttempts: 0, cashierPinLockedUntil: null },
      }),
    ]);
    await revokeAllCashierSessionsForEmployee(employeeId);

    return ok({ message: "Cashier access removed." });
  } catch (error) {
    return serverError(error);
  }
}
