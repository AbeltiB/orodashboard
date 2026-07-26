// src/app/api/telegram/schedules/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/api-auth";
import { badRequest, created, ok, serverError } from "@/lib/api-utils";
import { createScheduleSchema } from "@/lib/schemas/telegram";
import type { $Enums } from "@/generated/prisma/client";

function serializeSchedule(s: {
  id: string; name: string; reportType: string; reportFor: string; messageTemplate: string | null;
  includeDetailedFile: boolean;
  frequency: $Enums.TelegramFrequency; intervalDays: number | null; anchorDate: Date | null;
  weekday: number | null; dayOfMonth: number | null; monthOfYear: number | null;
  sendHour: number; sendMinute: number; isActive: boolean; lastRunDate: Date | null; lastRunStatus: string | null;
  recipients: { recipient: { id: string; label: string } }[];
}) {
  return {
    id: s.id,
    name: s.name,
    reportType: s.reportType,
    reportFor: s.reportFor,
    messageTemplate: s.messageTemplate,
    includeDetailedFile: s.includeDetailedFile,
    frequency: s.frequency,
    intervalDays: s.intervalDays,
    anchorDate: s.anchorDate,
    weekday: s.weekday,
    dayOfMonth: s.dayOfMonth,
    monthOfYear: s.monthOfYear,
    sendHour: s.sendHour,
    sendMinute: s.sendMinute,
    isActive: s.isActive,
    lastRunDate: s.lastRunDate,
    lastRunStatus: s.lastRunStatus,
    recipients: s.recipients.map((r) => r.recipient),
  };
}

const scheduleInclude = { recipients: { include: { recipient: { select: { id: true, label: true } } } } } as const;

/**
 * GET /api/telegram/schedules
 */
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, "telegram", "view");
  if ("error" in auth) return auth.error;

  try {
    const schedules = await prisma.telegramSchedule.findMany({ include: scheduleInclude, orderBy: { createdAt: "desc" } });
    return ok({ data: schedules.map(serializeSchedule) });
  } catch (error) {
    return serverError(error);
  }
}

/**
 * POST /api/telegram/schedules
 */
export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, "telegram", "edit");
  if ("error" in auth) return auth.error;

  try {
    const body = await request.json();
    const parsed = createScheduleSchema.safeParse(body);
    if (!parsed.success) return badRequest("Invalid request body.", parsed.error.flatten());

    const { recipientIds, anchorDate, ...rest } = parsed.data;

    const schedule = await prisma.telegramSchedule.create({
      data: {
        ...rest,
        anchorDate: anchorDate ? new Date(anchorDate) : undefined,
        createdBy: auth.session.adminUserId,
        recipients: { create: recipientIds.map((recipientId) => ({ recipientId })) },
      },
      include: scheduleInclude,
    });

    return created(serializeSchedule(schedule));
  } catch (error) {
    return serverError(error);
  }
}
