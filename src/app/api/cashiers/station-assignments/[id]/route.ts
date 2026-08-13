// src/app/api/cashiers/station-assignments/[id]/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/api-auth";
import { notFound, ok, serverError } from "@/lib/api-utils";

type Context = { params: Promise<{ id: string }> };

/**
 * DELETE /api/cashiers/station-assignments/:id
 * Deactivates the assignment (soft — keeps history intact) rather than
 * deleting the row.
 */
export async function DELETE(request: NextRequest, context: Context) {
  const auth = await requirePermission(request, "cashiers", "edit");
  if ("error" in auth) return auth.error;

  try {
    const { id } = await context.params;
    const existing = await prisma.cashierStationAssignment.findUnique({ where: { id } });
    if (!existing) return notFound("Assignment");

    await prisma.cashierStationAssignment.update({ where: { id }, data: { isActive: false } });
    return ok({ message: "Assignment removed." });
  } catch (error) {
    return serverError(error);
  }
}
