// src/app/api/telegram/messages/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/api-auth";
import { ok, parsePagination, serverError } from "@/lib/api-utils";

/**
 * GET /api/telegram/messages
 * Recent send history — across both scheduled and one-off custom sends.
 */
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, "telegram", "view");
  if ("error" in auth) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const { offset, limit } = parsePagination(searchParams, 50, 200);

    const [messages, total] = await Promise.all([
      prisma.telegramMessageLog.findMany({
        include: { recipient: { select: { id: true, label: true } }, schedule: { select: { id: true, name: true } } },
        orderBy: { sentAt: "desc" },
        skip: offset,
        take: limit,
      }),
      prisma.telegramMessageLog.count(),
    ]);

    return ok({
      data: messages.map((m) => ({
        id: m.id,
        recipient: m.recipient,
        schedule: m.schedule,
        reportType: m.reportType,
        content: m.content,
        status: m.status,
        errorMessage: m.errorMessage,
        sentAt: m.sentAt,
      })),
      meta: { total, offset, limit, hasMore: offset + messages.length < total },
    });
  } catch (error) {
    return serverError(error);
  }
}
