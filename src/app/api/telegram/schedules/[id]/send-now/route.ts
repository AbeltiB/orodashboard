// src/app/api/telegram/schedules/[id]/send-now/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/api-auth";
import { badRequest, notFound, ok, serverError } from "@/lib/api-utils";
import { runSchedule } from "@/lib/telegram/scheduler";

type Context = { params: Promise<{ id: string }> };

/**
 * POST /api/telegram/schedules/:id/send-now
 * Manual trigger — runs the schedule immediately regardless of its
 * configured time. Also updates lastRunDate like a normal run, so triggering
 * this counts as today's send and the automatic cron won't fire the same
 * report a second time later today.
 */
export async function POST(request: NextRequest, context: Context) {
  const auth = await requirePermission(request, "telegram", "edit");
  if ("error" in auth) return auth.error;

  try {
    const { id } = await context.params;
    const existing = await prisma.telegramSchedule.findUnique({ where: { id } });
    if (!existing) return notFound("Schedule");

    const result = await runSchedule(id);
    return ok(result);
  } catch (error) {
    if (error instanceof Error && error.message.includes("TELEGRAM_BOT_TOKEN")) return badRequest(error.message);
    return serverError(error);
  }
}
