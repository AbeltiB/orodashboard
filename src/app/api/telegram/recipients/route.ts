// src/app/api/telegram/recipients/route.ts
import { NextRequest } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/api-auth";
import { badRequest, created, ok, serverError } from "@/lib/api-utils";
import { createRecipientSchema } from "@/lib/schemas/telegram";

function generateLinkToken(): string {
  return crypto.randomBytes(12).toString("base64url");
}

/**
 * GET /api/telegram/recipients
 */
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, "telegram", "view");
  if ("error" in auth) return auth.error;

  try {
    const recipients = await prisma.telegramRecipient.findMany({ where: { isActive: true }, orderBy: { createdAt: "desc" } });
    return ok({
      data: recipients.map((r) => ({
        id: r.id,
        label: r.label,
        phone: r.phone,
        linkToken: r.linkToken,
        isLinked: !!r.telegramChatId,
        telegramUsername: r.telegramUsername,
        telegramFirstName: r.telegramFirstName,
        linkedAt: r.linkedAt,
        isActive: r.isActive,
        createdAt: r.createdAt,
      })),
    });
  } catch (error) {
    return serverError(error);
  }
}

/**
 * POST /api/telegram/recipients
 * Creates a recipient and its one-time linking token — the caller combines
 * this with TELEGRAM_BOT_USERNAME to build the `https://t.me/<bot>?start=<token>`
 * link to hand to that person.
 */
export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, "telegram", "edit");
  if ("error" in auth) return auth.error;

  try {
    const body = await request.json();
    const parsed = createRecipientSchema.safeParse(body);
    if (!parsed.success) return badRequest("Invalid request body.", parsed.error.flatten());

    const recipient = await prisma.telegramRecipient.create({
      data: { label: parsed.data.label, phone: parsed.data.phone || null, linkToken: generateLinkToken() },
    });

    return created({ id: recipient.id, label: recipient.label, linkToken: recipient.linkToken });
  } catch (error) {
    return serverError(error);
  }
}
