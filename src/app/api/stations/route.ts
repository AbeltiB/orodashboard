import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma, $Enums } from "@/generated/prisma/client";
import { requirePermission } from "@/lib/api-auth";
import {
  badRequest,
  created,
  generateStationCode,
  ok,
  parseIncludeDeleted,
  roadTypeToEnum,
  serializeStation,
  serverError,
} from "@/lib/api-utils";
import { createStationSchema } from "@/lib/schemas/station";
import type { TerminalInput } from "@/lib/schemas/terminal";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

const stationInclude = {
  terminalsAsOrigin: {
    where: { isDeleted: false },
    include: { linkedStation: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  },
  _count: {
    select: {
      terminalsAsOrigin: { where: { isDeleted: false } },
      employees: { where: { isDeleted: false } },
      posMachines: { where: { isDeleted: false } },
    },
  },
} as const;

export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, "stations", "view");
  if ("error" in auth) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const includeDeleted = parseIncludeDeleted(searchParams);
    const search = searchParams.get("search")?.trim();
    const region = searchParams.get("region")?.trim();
    const offset = Math.max(0, parseInt(searchParams.get("offset") ?? "0", 10) || 0);
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, parseInt(searchParams.get("limit") ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT)
    );

    const where: Prisma.StationWhereInput = {};

    if (!includeDeleted) {
      where.isDeleted = false;
    }

    if (region) {
      where.region = region as $Enums.Region;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { code: { contains: search, mode: "insensitive" } },
        { zone: { contains: search, mode: "insensitive" } },
        { location: { contains: search, mode: "insensitive" } },
      ];
    }

    const [stations, total] = await Promise.all([
      prisma.station.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: offset,
        take: limit,
        include: stationInclude,
      }),
      prisma.station.count({ where }),
    ]);

    return ok({
      data: stations.map(serializeStation),
      meta: {
        total,
        offset,
        limit,
        hasMore: offset + stations.length < total,
      },
    });
  } catch (error) {
    return serverError(error);
  }
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, "stations", "edit");
  if ("error" in auth) return auth.error;

  try {
    const body = await request.json();
    const parsed = createStationSchema.safeParse(body);

    if (!parsed.success) {
      return badRequest("Invalid request body.", parsed.error.flatten());
    }

    const { name, region, zone, location, terminals = [] } = parsed.data;
    const code = await generateStationCode();

    const station = await prisma.station.create({
      data: {
        code,
        name,
        region,
        zone,
        location,
        terminalsAsOrigin: {
          create: terminals.map((t) => terminalInputToPrisma(t)),
        },
      },
      include: stationInclude,
    });

    return created(serializeStation(station));
  } catch (error) {
    return serverError(error);
  }
}

function terminalInputToPrisma(
  input: TerminalInput
): Prisma.TerminalCreateWithoutStationInput {
  const isStation = input.isStation;
  const roadTypeInput = input.roadType;

  return {
    name: input.name,
    isLinkedStation: isStation,
    isDeparture: input.isDeparture,
    isArrival: input.isArrival,
    distanceKm: input.distanceKm,
    roadType: roadTypeToEnum(roadTypeInput),
    asphaltKm: roadTypeInput === "mixed" ? (input.asphaltKm ?? 0) : null,
    gravelKm: roadTypeInput === "mixed" ? (input.gravelKm ?? 0) : null,
    ...(isStation && input.linkedStationId
      ? { linkedStation: { connect: { id: input.linkedStationId } } }
      : {}),
  };
}
