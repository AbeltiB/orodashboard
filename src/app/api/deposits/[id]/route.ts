// src/app/api/deposits/[id]/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/api-auth";
import { badRequest, notFound, ok, serverError } from "@/lib/api-utils";
import { discrepancyReasonSchema } from "@/lib/schemas/deposit";
import { serializeDeposit } from "@/lib/deposits";

type Context = { params: Promise<{ id: string }> };

/**
 * PATCH /api/deposits/:id
 * Admin writes a reason for a VERIFIED_MISMATCH (or a FAILED verification)
 * and closes it out as RESOLVED. Only meaningful once verify.et has actually
 * returned a result — pending/awaiting deposits have nothing to explain yet.
 */
export async function PATCH(request: NextRequest, context: Context) {
  const auth = await requirePermission(request, "deposits", "edit");
  if ("error" in auth) return auth.error;

  try {
    const { id } = await context.params;
    const existing = await prisma.deposit.findUnique({ where: { id } });
    if (!existing) return notFound("Deposit");
    if (existing.status !== "VERIFIED_MISMATCH" && existing.status !== "FAILED") {
      return badRequest("Only a mismatched or failed deposit can have a discrepancy reason recorded.");
    }

    const body = await request.json();
    const parsed = discrepancyReasonSchema.safeParse(body);
    if (!parsed.success) return badRequest("Invalid request body.", parsed.error.flatten());

    const updated = await prisma.deposit.update({
      where: { id },
      data: {
        discrepancyReason: parsed.data.reason,
        discrepancyResolvedBy: auth.session.adminUserId,
        discrepancyResolvedAt: new Date(),
        status: "RESOLVED",
      },
      include: {
        employee: { select: { id: true, code: true, firstName: true, lastName: true } },
        terminal: { select: { id: true, name: true } },
      },
    });

    return ok({ data: serializeDeposit(updated) });
  } catch (error) {
    return serverError(error);
  }
}
