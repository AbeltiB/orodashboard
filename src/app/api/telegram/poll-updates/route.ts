// src/app/api/telegram/poll-updates/route.ts
import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/api-auth";
import { ok, unauthorized, serverError } from "@/lib/api-utils";
import { runUpdatesPoll } from "@/lib/telegram/scheduler";

/**
 * POST /api/telegram/poll-updates
 * Long-poll fallback that links any recipient who has sent /start to the
 * bot since the last check. Two ways in, mirroring /api/sales/sync:
 *  - `x-sync-token` header matching TELEGRAM_CRON_TOKEN -> external cron,
 *    call every minute or so for near-instant linking.
 *  - An authenticated admin session with telegram edit access -> manual
 *    "Check for replies" button on the Recipients panel.
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
    const result = await runUpdatesPoll();
    return ok(result);
  } catch (error) {
    return serverError(error);
  }
}
