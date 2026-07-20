// src/app/api/ota/vehicles/sync/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/api-auth";
import { ok, parsePagination, serializeOtaSyncLog, serverError } from "@/lib/api-utils";
import { runOtaVehicleSync } from "@/lib/ota/entity-sync";

// The largest of the three mirrors (~19.8k rows as of the last count) — ask
// the platform for as much headroom as it'll give, same rationale as the
// sales trips sync.
export const maxDuration = 300;

/**
 * POST /api/ota/vehicles/sync
 * Triggers a sync from OTA's /api/vehicles — NOT company-scoped, mirrors the
 * entire nationwide vehicle fleet. `?stream=1` gets a live text/event-stream
 * of progress for the "Sync now" button.
 */
export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, "ota-vehicles", "edit");
  if ("error" in auth) return auth.error;

  const streamRequested = new URL(request.url).searchParams.get("stream") === "1";
  if (!streamRequested) {
    try {
      const result = await runOtaVehicleSync({ source: "MANUAL", triggeredBy: auth.session.adminUserId });
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
        const result = await runOtaVehicleSync({
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
 * GET /api/ota/vehicles/sync
 * Lists past vehicle sync runs, newest first.
 */
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, "ota-vehicles", "view");
  if ("error" in auth) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const { offset, limit } = parsePagination(searchParams, 20, 100);

    const [logs, total] = await Promise.all([
      prisma.otaSyncLog.findMany({ where: { entity: "VEHICLES" }, orderBy: { startedAt: "desc" }, skip: offset, take: limit }),
      prisma.otaSyncLog.count({ where: { entity: "VEHICLES" } }),
    ]);

    return ok({
      data: logs.map(serializeOtaSyncLog),
      meta: { total, offset, limit, hasMore: offset + logs.length < total },
    });
  } catch (error) {
    return serverError(error);
  }
}
