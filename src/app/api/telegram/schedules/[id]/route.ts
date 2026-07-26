// src/app/api/telegram/schedules/[id]/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/api-auth";
import { badRequest, notFound, ok, serverError } from "@/lib/api-utils";
import { updateScheduleSchema } from "@/lib/schemas/telegram";
import type { $Enums } from "@/generated/prisma/client";

const scheduleInclude = { recipients: { include: { recipient: { select: { id: true, label: true } } } } } as const;

function serializeSchedule(s: {
  id: string; name: string; reportType: string; reportFor: string; messageTemplate: string | null;
  includeDetailedFile: boolean;
  frequency: $Enums.TelegramFrequency; intervalDays: number | null; anchorDate: Date | null;
  weekday: number | null; dayOfMonth: number | null; monthOfYear: number | null;
  sendHour: number; sendMinute: number; isActive: boolean; lastRunDate: Date | null; lastRunStatus: string | null;
  recipients: { recipient: { id: string; label: string } }[];
}) {
  return {
    id: s.id, name: s.name, reportType: s.reportType, reportFor: s.reportFor, messageTemplate: s.messageTemplate,
    includeDetailedFile: s.includeDetailedFile,
    frequency: s.frequency, intervalDays: s.intervalDays, anchorDate: s.anchorDate,
    weekday: s.weekday, dayOfMonth: s.dayOfMonth, monthOfYear: s.monthOfYear,
    sendHour: s.sendHour, sendMinute: s.sendMinute, isActive: s.isActive, lastRunDate: s.lastRunDate, lastRunStatus: s.lastRunStatus,
    recipients: s.recipients.map((r) => r.recipient),
  };
}

type Context = { params: Promise<{ id: string }> };

/**
 * PATCH /api/telegram/schedules/:id
 */
export async function PATCH(request: NextRequest, context: Context) {
  const auth = await requirePermission(request, "telegram", "edit");
  if ("error" in auth) return auth.error;

  try {
    const { id } = await context.params;
    const existing = await prisma.telegramSchedule.findUnique({ where: { id } });
    if (!existing) return notFound("Schedule");

    const body = await request.json();
    const parsed = updateScheduleSchema.safeParse(body);
    if (!parsed.success) return badRequest("Invalid request body.", parsed.error.flatten());

    const { recipientIds, anchorDate, ...rest } = parsed.data;

    const schedule = await prisma.telegramSchedule.update({
      where: { id },
      data: {
        ...rest,
        ...(anchorDate !== undefined && { anchorDate: anchorDate ? new Date(anchorDate) : null }),
        ...(recipientIds && {
          recipients: {
            deleteMany: {},
            create: recipientIds.map((recipientId) => ({ recipientId })),
          },
        }),
      },
      include: scheduleInclude,
    });

    return ok(serializeSchedule(schedule));
  } catch (error) {
    return serverError(error);
  }
}

/**
 * DELETE /api/telegram/schedules/:id
 */
export async function DELETE(request: NextRequest, context: Context) {
  const auth = await requirePermission(request, "telegram", "edit");
  if ("error" in auth) return auth.error;

  try {
    const { id } = await context.params;
    const existing = await prisma.telegramSchedule.findUnique({ where: { id } });
    if (!existing) return notFound("Schedule");

    await prisma.telegramSchedule.delete({ where: { id } });
    return ok({ message: "Schedule deleted." });
  } catch (error) {
    return serverError(error);
  }
}
