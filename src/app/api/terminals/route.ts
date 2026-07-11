// src/app/api/terminals/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { requireAuth } from "@/lib/api-auth";
import {
  ok,
  parseIncludeDeleted,
  parsePagination,
  serializeTerminal,
  serverError,
} from "@/lib/api-utils";

/**
 * GET /api/terminals
 * Read-only listing. Terminals are created/updated via the stations API
 * (PATCH /api/stations/:id with a `terminals` array). This endpoint exists
 * for cross-station lookups, reporting, and the fare calculator.
 *
 * Query params:
 *   stationId        — filter by origin station
 *   linkedStationId  — filter by linked/target station
 *   roadType         — ASPHALT | GRAVEL | MIXED
 *   isDeparture      — "true" | "false"
 *   isArrival        — "true" | "false"
 *   search           — partial match on terminal name
 *   includeDeleted   — include soft-deleted records
 *   offset, limit
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if ("error" in auth) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const includeDeleted = parseIncludeDeleted(searchParams);
    const { offset, limit } = parsePagination(searchParams, 200, 1000);

    const stationId = searchParams.get("stationId")?.trim();
    const linkedStationId = searchParams.get("linkedStationId")?.trim();
    const roadType = searchParams.get("roadType")?.trim();
    const search = searchParams.get("search")?.trim();

    const isDepartureParam = searchParams.get("isDeparture");
    const isArrivalParam = searchParams.get("isArrival");

    const where: Prisma.TerminalWhereInput = {};
    if (!includeDeleted) where.isDeleted = false;
    if (stationId) where.stationId = stationId;
    if (linkedStationId) where.linkedStationId = linkedStationId;
    if (roadType) where.roadType = roadType as Prisma.TerminalWhereInput["roadType"];
    if (isDepartureParam !== null) where.isDeparture = isDepartureParam === "true";
    if (isArrivalParam !== null) where.isArrival = isArrivalParam === "true";
    if (search) where.name = { contains: search, mode: "insensitive" };

    const [terminals, total] = await Promise.all([
      prisma.terminal.findMany({
        where,
        include: {
          station: { select: { id: true, name: true, code: true, region: true } },
          linkedStation: { select: { id: true, name: true, code: true } },
        },
        orderBy: [{ stationId: "asc" }, { createdAt: "asc" }],
        skip: offset,
        take: limit,
      }),
      prisma.terminal.count({ where }),
    ]);

    return ok({
      data: terminals.map((t) => ({
        ...serializeTerminal(t),
        station: t.station,
        linkedStation: t.linkedStation,
      })),
      meta: { total, offset, limit, hasMore: offset + terminals.length < total },
    });
  } catch (error) {
    return serverError(error);
  }
}