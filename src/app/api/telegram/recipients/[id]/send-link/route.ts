// src/app/api/telegram/recipients/[id]/send-link/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/api-auth";
import { badRequest, notFound, ok, serverError } from "@/lib/api-utils";
import { sendSms } from "@/lib/sms";
import { buildRecipientLink, telegramConfigFromEnv } from "@/lib/telegram/client";

type Context = { params: Promise<{ id: string }> };

/**
 * POST /api/telegram/recipients/:id/send-link
 * Texts the recipient's one-time Telegram linking link to their phone
 * number — the same link shown (and copyable) in the dashboard, just
 * delivered directly instead of relying on someone manually forwarding it.
 * Requires the recipient to have a phone number on file.
 */
export async function POST(request: NextRequest, context: Context) {
  const auth = await requirePermission(request, "telegram", "edit");
  if ("error" in auth) return auth.error;

  try {
    const { id } = await context.params;
    const recipient = await prisma.telegramRecipient.findUnique({ where: { id } });
    if (!recipient) return notFound("Recipient");
    if (recipient.telegramChatId) return badRequest("This recipient is already linked.");
    if (!recipient.phone) return badRequest("Add a phone number for this recipient first.");

    let config;
    try {
      config = telegramConfigFromEnv();
    } catch (error) {
      return badRequest(error instanceof Error ? error.message : "Telegram isn't configured yet.");
    }

    const link = await buildRecipientLink(config, recipient.linkToken);
    const message = `Hi ${recipient.label}, tap this link in Telegram and press Start to receive OroDashboard reports: ${link}`;
    await sendSms(recipient.phone, message);

    return ok({ message: "Link sent." });
  } catch (error) {
    return serverError(error);
  }
}
