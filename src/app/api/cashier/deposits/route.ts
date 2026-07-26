// src/app/api/cashier/deposits/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCashierAuth } from "@/lib/cashier-auth";
import { ok, serverError } from "@/lib/api-utils";
import { ensureDeposit, serializeDeposit } from "@/lib/deposits";

/**
 * GET /api/cashier/deposits
 * Today's deposit (one per active terminal assignment) for the signed-in
 * cashier — auto-creates each row (with a freshly computed expected amount)
 * on first fetch of the day.
 */
export async function GET(request: NextRequest) {
  const auth = await requireCashierAuth(request);
  if ("error" in auth) return auth.error;

  try {
    const assignments = await prisma.cashierTerminalAssignment.findMany({
      where: { employeeId: auth.session.employeeId, isActive: true },
      include: { terminal: { select: { id: true, name: true } } },
    });

    const today = new Date();
    const deposits = await Promise.all(
      assignments.map(async (a) => {
        const deposit = await ensureDeposit(auth.session.employeeId, a.terminalId, today);
        return serializeDeposit({ ...deposit, terminal: a.terminal });
      })
    );

    return ok({ data: deposits });
  } catch (error) {
    return serverError(error);
  }
}
