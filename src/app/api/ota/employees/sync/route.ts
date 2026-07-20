// src/app/api/ota/employees/sync/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/api-auth";
import { ok, parsePagination, serializeOtaSyncLog, serverError } from "@/lib/api-utils";
import { runOtaEmployeeSync } from "@/lib/ota/entity-sync";

export const maxDuration = 60;

/**
 * POST /api/ota/employees/sync
 * Triggers a sync from OTA's /api/company-users (this company's roster only).
 * `?stream=1` gets a live text/event-stream of progress for the "Sync now" button.
 */
export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, "ota-employees", "edit");
  if ("error" in auth) return auth.error;

  const streamRequested = new URL(request.url).searchParams.get("stream") === "1";
  if (!streamRequested) {
    try {
      const result = await runOtaEmployeeSync({ source: "MANUAL", triggeredBy: auth.session.adminUserId });
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
        const result = await runOtaEmployeeSync({
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
 * GET /api/ota/employees/sync
 * Lists past employee sync runs, newest first.
 */
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, "ota-employees", "view");
  if ("error" in auth) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const { offset, limit } = parsePagination(searchParams, 20, 100);

    const [logs, total] = await Promise.all([
      prisma.otaSyncLog.findMany({ where: { entity: "EMPLOYEES" }, orderBy: { startedAt: "desc" }, skip: offset, take: limit }),
      prisma.otaSyncLog.count({ where: { entity: "EMPLOYEES" } }),
    ]);

    return ok({
      data: logs.map(serializeOtaSyncLog),
      meta: { total, offset, limit, hasMore: offset + logs.length < total },
    });
  } catch (error) {
    return serverError(error);
  }
}
