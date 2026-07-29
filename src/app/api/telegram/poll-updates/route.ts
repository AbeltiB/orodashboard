// src/app/api/telegram/poll-updates/route.ts
import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/api-auth";
import { ok, unauthorized, serverError } from "@/lib/api-utils";
import { runUpdatesPoll } from "@/lib/telegram/scheduler";

// Real work (links recipients) on every call — never cache/statically render.
export const dynamic = "force-dynamic";

/**
 * Long-poll fallback that links any recipient who has sent /start to the
 * bot since the last check. Three ways in — see run-scheduled/route.ts for
 * the full rationale on the GET+query-token option:
 *  - `x-sync-token` header matching TELEGRAM_CRON_TOKEN -> external cron
 *    that supports custom headers, POST.
 *  - `?token=` query param matching TELEGRAM_CRON_TOKEN -> plain GET, for
 *    free "ping this URL" services (e.g. UptimeRobot's free tier).
 *  - An authenticated admin session with telegram edit access -> manual
 *    "Check for replies" button on the Recipients panel.
 * Call every minute or so for near-instant linking.
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
    const result = await runUpdatesPoll();
    return ok(result);
  } catch (error) {
    return serverError(error);
  }
}

export const POST = handle;
export const GET = handle;
