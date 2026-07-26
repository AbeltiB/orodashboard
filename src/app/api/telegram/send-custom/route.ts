// src/app/api/telegram/send-custom/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/api-auth";
import { badRequest, ok, serverError } from "@/lib/api-utils";
import { sendCustomMessageSchema } from "@/lib/schemas/telegram";
import { sendTelegramMessage, telegramConfigFromEnv } from "@/lib/telegram/client";

/**
 * POST /api/telegram/send-custom
 * One-off message to hand-picked recipients — not tied to a recurring
 * schedule, sent immediately. Logged with scheduleId null so it still shows
 * up in the message history.
 */
export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, "telegram", "edit");
  if ("error" in auth) return auth.error;

  try {
    const body = await request.json();
    const parsed = sendCustomMessageSchema.safeParse(body);
    if (!parsed.success) return badRequest("Invalid request body.", parsed.error.flatten());

    let config;
    try {
      config = telegramConfigFromEnv();
    } catch (error) {
      return badRequest(error instanceof Error ? error.message : "Telegram isn't configured yet.");
    }

    const recipients = await prisma.telegramRecipient.findMany({
      where: { id: { in: parsed.data.recipientIds }, isActive: true },
    });

    let sent = 0;
    let failed = 0;

    for (const recipient of recipients) {
      if (!recipient.telegramChatId) {
        failed++;
        await prisma.telegramMessageLog.create({
          data: { recipientId: recipient.id, reportType: "CUSTOM", content: parsed.data.message, status: "FAILED", errorMessage: "Recipient hasn't linked their Telegram account yet." },
        });
        continue;
      }
      try {
        await sendTelegramMessage(config, recipient.telegramChatId, parsed.data.message);
        await prisma.telegramMessageLog.create({
          data: { recipientId: recipient.id, reportType: "CUSTOM", content: parsed.data.message, status: "SENT" },
        });
        sent++;
      } catch (error) {
        failed++;
        await prisma.telegramMessageLog.create({
          data: { recipientId: recipient.id, reportType: "CUSTOM", content: parsed.data.message, status: "FAILED", errorMessage: error instanceof Error ? error.message : "Unknown error." },
        });
      }
    }

    return ok({ sent, failed });
  } catch (error) {
    return serverError(error);
  }
}
