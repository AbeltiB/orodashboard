// src/app/api/telegram/status/route.ts
import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/api-auth";
import { ok, serverError } from "@/lib/api-utils";
import { getBotInfo, telegramConfigFromEnv } from "@/lib/telegram/client";

/**
 * GET /api/telegram/status
 * Whether TELEGRAM_BOT_TOKEN is configured and valid — used to build the
 * `t.me/<username>?start=...` recipient link and to show a connection
 * indicator on the Telegram admin page.
 */
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, "telegram", "view");
  if ("error" in auth) return auth.error;

  try {
    const config = telegramConfigFromEnv();
    const bot = await getBotInfo(config);
    return ok({ connected: true, username: bot.username });
  } catch (error) {
    return ok({ connected: false, message: error instanceof Error ? error.message : "Telegram isn't configured." });
  }
}
