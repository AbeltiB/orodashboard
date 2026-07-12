// src/app/api/sales/sync/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/api-auth";
import { ok, parsePagination, serializeSalesSyncLog, serverError, unauthorized } from "@/lib/api-utils";
import { runSalesSync } from "@/lib/ota/sync";

// A full sync can run for a few minutes (multi-pass walk of the source's
// entire table) — ask the platform for as much headroom as it'll give on
// this route. On Vercel's Hobby tier this is capped lower regardless (10s);
// Pro/Enterprise honor this up to their own ceiling.
export const maxDuration = 300;

/**
 * POST /api/sales/sync
 * Triggers a sync from the OTA source system. Two ways in:
 *  - An authenticated admin session with sales edit access -> logged as MANUAL.
 *  - The `x-sync-token` header matching SALES_SYNC_TOKEN -> logged as AUTO,
 *    so an external cron trigger can call this without a browser session.
 *
 * Manual triggers can add `?stream=1` to get a live text/event-stream of
 * progress (probe result, per-page counts, pass completion) instead of
 * waiting silently for the final JSON result — meant for the "Sync now"
 * button, not the cron trigger.
 */
export async function POST(request: NextRequest) {
  const tokenHeader = request.headers.get("x-sync-token");
  const expectedToken = process.env.SALES_SYNC_TOKEN;

  if (tokenHeader) {
    if (!expectedToken || tokenHeader !== expectedToken) {
      return unauthorized("Invalid sync token.");
    }
    try {
      const result = await runSalesSync({ source: "AUTO" });
      return ok(result);
    } catch (error) {
      return serverError(error);
    }
  }

  const auth = await requirePermission(request, "sales", "edit");
  if ("error" in auth) return auth.error;

  const streamRequested = new URL(request.url).searchParams.get("stream") === "1";
  if (!streamRequested) {
    try {
      const result = await runSalesSync({ source: "MANUAL", triggeredBy: auth.session.adminUserId });
      return ok(result);
    } catch (error) {
      return serverError(error);
    }
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (payload: unknown) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };
      try {
        const result = await runSalesSync({
          source: "MANUAL",
          triggeredBy: auth.session.adminUserId,
          onProgress: (event) => send({ kind: "progress", event }),
        });
        send({ kind: "done", result });
      } catch (error) {
        send({ kind: "error", message: error instanceof Error ? error.message : String(error) });
      } finally {
        closed = true;
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

/**
 * GET /api/sales/sync
 * Lists past sync runs, newest first.
 */
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, "sales", "view");
  if ("error" in auth) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const { offset, limit } = parsePagination(searchParams, 20, 100);

    const [logs, total] = await Promise.all([
      prisma.salesSyncLog.findMany({ orderBy: { startedAt: "desc" }, skip: offset, take: limit }),
      prisma.salesSyncLog.count(),
    ]);

    return ok({
      data: logs.map(serializeSalesSyncLog),
      meta: { total, offset, limit, hasMore: offset + logs.length < total },
    });
  } catch (error) {
    return serverError(error);
  }
}
