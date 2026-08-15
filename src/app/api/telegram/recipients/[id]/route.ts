// src/app/api/telegram/recipients/[id]/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/api-auth";
import { badRequest, notFound, ok, serverError } from "@/lib/api-utils";
import { updateRecipientSchema } from "@/lib/schemas/telegram";

type Context = { params: Promise<{ id: string }> };

/**
 * PATCH /api/telegram/recipients/:id
 * Edits a recipient in place — most usefully their station scope, so fixing
 * a wrong assignment doesn't mean deleting and recreating them (which would
 * also throw away their Telegram link and require re-linking).
 */
export async function PATCH(request: NextRequest, context: Context) {
  const auth = await requirePermission(request, "telegram", "edit");
  if ("error" in auth) return auth.error;

  try {
    const { id } = await context.params;
    const existing = await prisma.telegramRecipient.findUnique({ where: { id } });
    if (!existing) return notFound("Recipient");

    const body = await request.json();
    const parsed = updateRecipientSchema.safeParse(body);
    if (!parsed.success) return badRequest("Invalid request body.", parsed.error.flatten());

    if (parsed.data.stationId) {
      const station = await prisma.station.findUnique({ where: { id: parsed.data.stationId }, select: { id: true, isDeleted: true } });
      if (!station || station.isDeleted) return notFound("Station");
    }

    const recipient = await prisma.telegramRecipient.update({
      where: { id },
      data: {
        label: parsed.data.label,
        phone: parsed.data.phone,
        stationId: parsed.data.stationId,
        isActive: parsed.data.isActive,
      },
      include: { station: { select: { id: true, name: true } } },
    });

    return ok({ id: recipient.id, label: recipient.label, stationId: recipient.stationId, station: recipient.station });
  } catch (error) {
    return serverError(error);
  }
}

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
