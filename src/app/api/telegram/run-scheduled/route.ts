// src/app/api/telegram/run-scheduled/route.ts
import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/api-auth";
import { ok, unauthorized, serverError } from "@/lib/api-utils";
import { runDueSchedules } from "@/lib/telegram/scheduler";

// This GET does real work (fires due reports) — never let it be treated as a
// cacheable/static route.
export const dynamic = "force-dynamic";

/**
 * Fires every active schedule whose configured local time has passed for
 * today (Addis time) and hasn't already run today. Three ways in, mirroring
 * /api/sales/sync and /api/deposits/poll-pending:
 *  - `x-sync-token` header matching TELEGRAM_CRON_TOKEN -> external cron
 *    that supports custom headers (e.g. cron-job.org), POST.
 *  - `?token=` query param matching TELEGRAM_CRON_TOKEN -> plain GET, for
 *    free "ping this URL" services that can't send custom headers or POST
 *    (e.g. UptimeRobot's free tier). Less conventional than a header, but
 *    this endpoint only ever triggers a low-privilege, idempotent check —
 *    never returns or accepts anything sensitive — so a token in the URL is
 *    an acceptable tradeoff for that compatibility.
 *  - An authenticated admin session with telegram edit access -> manual
 *    "Run due schedules now" button, POST.
 * Call every 1-5 minutes; safe at any cadence since lastRunDate dedupes.
 */
async function handle(request: NextRequest) {
  const tokenHeader = request.headers.get("x-sync-token");
  const tokenQuery = request.nextUrl.searchParams.get("token");
  const suppliedToken = tokenHeader ?? tokenQuery;
  const expectedToken = process.env.TELEGRAM_CRON_TOKEN;

  if (suppliedToken) {
    if (!expectedToken || suppliedToken !== expectedToken) {
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

export const POST = handle;
export const GET = handle;
