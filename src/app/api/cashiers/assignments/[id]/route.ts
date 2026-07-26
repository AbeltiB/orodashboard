// src/app/api/cashiers/assignments/[id]/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/api-auth";
import { notFound, ok, serverError } from "@/lib/api-utils";

type Context = { params: Promise<{ id: string }> };

/**
 * DELETE /api/cashiers/assignments/:id
 * Deactivates the assignment (soft — keeps deposit history intact) rather
 * than deleting the row.
 */
export async function DELETE(request: NextRequest, context: Context) {
  const auth = await requirePermission(request, "cashiers", "edit");
  if ("error" in auth) return auth.error;

  try {
    const { id } = await context.params;
    const existing = await prisma.cashierTerminalAssignment.findUnique({ where: { id } });
    if (!existing) return notFound("Assignment");

    await prisma.cashierTerminalAssignment.update({ where: { id }, data: { isActive: false } });
    return ok({ message: "Assignment removed." });
  } catch (error) {
    return serverError(error);
  }
}
