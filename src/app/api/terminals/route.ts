import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { requireAuth } from "@/lib/api-auth";
import {
  badRequest,
  created,
  ok,
  parseIncludeDeleted,
  roadTypeToEnum,
  serializeTerminal,
  serverError,
} from "@/lib/api-utils";
import { createTerminalSchema } from "@/lib/schemas/terminal";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

const terminalInclude = {
  station: { select: { id: true, name: true, code: true } },
  linkedStation: { select: { id: true, name: true, code: true } },
} as const;

export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (auth) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const includeDeleted = parseIncludeDeleted(searchParams);
    const stationId = searchParams.get("stationId")?.trim();
    const roadType = searchParams.get("roadType")?.trim().toLowerCase();
    const search = searchParams.get("search")?.trim();
    const offset = Math.max(0, parseInt(searchParams.get("offset") ?? "0", 10) || 0);
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, parseInt(searchParams.get("limit") ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT)
    );

    const where: Prisma.TerminalWhereInput = {};

    if (!includeDeleted) {
      where.isDeleted = false;
    }

    if (stationId) {
      where.stationId = stationId;
    }

    if (roadType && ["asphalt", "gravel", "mixed"].includes(roadType)) {
      where.roadType = roadTypeToEnum(roadType as "asphalt" | "gravel" | "mixed");
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { station: { name: { contains: search, mode: "insensitive" } } },
      ];
    }

    const [terminals, total] = await Promise.all([
      prisma.terminal.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: offset,
        take: limit,
        include: terminalInclude,
      }),
      prisma.terminal.count({ where }),
    ]);

    return ok({
      data: terminals.map((t) => ({
        ...serializeTerminal(t),
        station: t.station,
        linkedStation: t.linkedStation,
      })),
      meta: {
        total,
        offset,
        limit,
        hasMore: offset + terminals.length < total,
      },
    });
  } catch (error) {
    return serverError(error);
  }
}

export async function POST(request: NextRequest) {
  const auth = requireAuth(request);
  if (auth) return auth;

  try {
    const body = await request.json();
    const parsed = createTerminalSchema.safeParse(body);

    if (!parsed.success) {
      return badRequest("Invalid request body.", parsed.error.flatten());
    }

    const { stationId, name, isStation, linkedStationId, isDeparture, isArrival, distanceKm, roadType, asphaltKm, gravelKm } = parsed.data;

    const terminal = await prisma.terminal.create({
      data: {
        stationId,
        name,
        isLinkedStation: isStation,
        linkedStationId: isStation ? (linkedStationId ?? null) : null,
        isDeparture,
        isArrival,
        distanceKm,
        roadType: roadTypeToEnum(roadType),
        asphaltKm: roadType === "mixed" ? (asphaltKm ?? 0) : null,
        gravelKm: roadType === "mixed" ? (gravelKm ?? 0) : null,
      },
      include: terminalInclude,
    });

    return created({
      ...serializeTerminal(terminal),
      station: terminal.station,
      linkedStation: terminal.linkedStation,
    });
  } catch (error) {
    return serverError(error);
  }
}
