// src/app/api/telegram/recipients/[id]/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/api-auth";
import { notFound, ok, serverError } from "@/lib/api-utils";

type Context = { params: Promise<{ id: string }> };

/**
 * DELETE /api/telegram/recipients/:id
 * Deactivates the recipient (soft — keeps message history intact) rather
 * than deleting the row.
 */
export async function DELETE(request: NextRequest, context: Context) {
  const auth = await requirePermission(request, "telegram", "edit");
  if ("error" in auth) return auth.error;

  try {
    const { id } = await context.params;
    const existing = await prisma.telegramRecipient.findUnique({ where: { id } });
    if (!existing) return notFound("Recipient");

    await prisma.telegramRecipient.update({ where: { id }, data: { isActive: false } });
    return ok({ message: "Recipient removed." });
  } catch (error) {
    return serverError(error);
  }
}
