// src/app/api/cashier/deposits/[id]/submit/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCashierAuth } from "@/lib/cashier-auth";
import { badRequest, forbidden, notFound, ok, serverError } from "@/lib/api-utils";
import { submitDepositSchema } from "@/lib/schemas/deposit";
import { submitDeposit, serializeDeposit, DepositSubmitError } from "@/lib/deposits";
import { VerifyEtError } from "@/lib/verify-et/client";

type Context = { params: Promise<{ id: string }> };

/**
 * POST /api/cashier/deposits/:id/submit
 * A cashier submits their bank/mobile-money reference number for today's
 * deposit — verified against verify.et before the row is marked settled.
 */
export async function POST(request: NextRequest, context: Context) {
  const auth = await requireCashierAuth(request);
  if ("error" in auth) return auth.error;

  try {
    const { id } = await context.params;
    const existing = await prisma.deposit.findUnique({
      where: { id },
      include: { terminal: { select: { id: true, name: true } } },
    });
    if (!existing) return notFound("Deposit");
    if (existing.employeeId !== auth.session.employeeId) {
      return forbidden("This deposit doesn't belong to your account.");
    }

    const body = await request.json();
    const parsed = submitDepositSchema.safeParse(body);
    if (!parsed.success) return badRequest("Invalid request body.", parsed.error.flatten());

    const updated = await submitDeposit(id, {
      bank: parsed.data.bank,
      reference: parsed.data.reference,
      accountSuffix: parsed.data.accountSuffix,
      phoneNumber: parsed.data.phoneNumber,
    });

    return ok({ data: serializeDeposit({ ...updated, terminal: existing.terminal }) });
  } catch (error) {
    if (error instanceof DepositSubmitError) return badRequest(error.message);
    if (error instanceof VerifyEtError) return badRequest(error.message);
    return serverError(error);
  }
}
