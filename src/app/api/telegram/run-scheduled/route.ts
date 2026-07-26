// src/app/api/telegram/run-scheduled/route.ts
import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/api-auth";
import { ok, unauthorized, serverError } from "@/lib/api-utils";
import { runDueSchedules } from "@/lib/telegram/scheduler";

/**
 * POST /api/telegram/run-scheduled
 * Fires every active schedule whose configured local time has passed for
 * today (Addis time) and hasn't already run today. Two ways in, mirroring
 * /api/sales/sync and /api/deposits/poll-pending:
 *  - `x-sync-token` header matching TELEGRAM_CRON_TOKEN -> external cron,
 *    call every few minutes (safe at any cadence — lastRunDate dedupes).
 *  - An authenticated admin session with telegram edit access -> manual
 *    "Run due schedules now" button.
 */
export async function POST(request: NextRequest) {
  const tokenHeader = request.headers.get("x-sync-token");
  const expectedToken = process.env.TELEGRAM_CRON_TOKEN;

  if (tokenHeader) {
    if (!expectedToken || tokenHeader !== expectedToken) {
      return unauthorized("Invalid sync token.");
    }
  } else {
    const auth = await requirePermission(request, "telegram", "edit");
    if ("error" in auth) return auth.error;
  }

  try {
    const result = await runDueSchedules();
    return ok(result);
  } catch (error) {
    return serverError(error);
  }
}
