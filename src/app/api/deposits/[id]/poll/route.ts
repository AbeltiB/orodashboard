// src/app/api/deposits/[id]/poll/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/api-auth";
import { badRequest, notFound, ok, serverError } from "@/lib/api-utils";
import { pollPendingDeposit, serializeDeposit, DepositSubmitError } from "@/lib/deposits";
import { VerifyEtError } from "@/lib/verify-et/client";

type Context = { params: Promise<{ id: string }> };

/**
 * POST /api/deposits/:id/poll
 * Manual "Refresh" button for a deposit stuck in SUBMITTED — re-checks
 * verify.et's status endpoint. No-op if it's not actually pending.
 */
export async function POST(request: NextRequest, context: Context) {
  const auth = await requirePermission(request, "deposits", "edit");
  if ("error" in auth) return auth.error;

  try {
    const { id } = await context.params;
    const existing = await prisma.deposit.findUnique({
      where: { id },
      include: {
        employee: { select: { id: true, code: true, firstName: true, lastName: true } },
        terminal: { select: { id: true, name: true } },
      },
    });
    if (!existing) return notFound("Deposit");

    const updated = await pollPendingDeposit(id);
    return ok({ data: serializeDeposit({ ...updated, employee: existing.employee, terminal: existing.terminal }) });
  } catch (error) {
    if (error instanceof DepositSubmitError) return badRequest(error.message);
    if (error instanceof VerifyEtError) return badRequest(error.message);
    return serverError(error);
  }
}
