import { $Enums, type Terminal, type Station } from "@/generated/prisma/client";
import { prisma } from "./prisma";

// ─────────────────────────────────────────────────────────────────────────────
// Region / road-type helpers
// ─────────────────────────────────────────────────────────────────────────────

export const REGION_VALUES = [
  "ADDIS_ABABA",
  "OROMIA",
  "AMHARA",
  "TIGRAY",
  "SNNPR",
  "AFAR",
  "SOMALI",
  "BENISHANGUL_GUMUZ",
  "GAMBELA",
  "HARARI",
  "DIRE_DAWA",
  "SIDAMA",
] as const;

export const ROAD_TYPE_INPUTS = ["asphalt", "gravel", "mixed"] as const;

const roadTypeInputToEnum: Record<(typeof ROAD_TYPE_INPUTS)[number], $Enums.RoadType> = {
  asphalt: "ASPHALT",
  gravel: "GRAVEL",
  mixed: "MIXED",
};

const roadTypeEnumToInput: Record<$Enums.RoadType, (typeof ROAD_TYPE_INPUTS)[number]> = {
  ASPHALT: "asphalt",
  GRAVEL: "gravel",
  MIXED: "mixed",
};

export function roadTypeToEnum(value: (typeof ROAD_TYPE_INPUTS)[number]): $Enums.RoadType {
  return roadTypeInputToEnum[value];
}

export function roadTypeFromEnum(value: $Enums.RoadType): (typeof ROAD_TYPE_INPUTS)[number] {
  return roadTypeEnumToInput[value] ?? "asphalt";
}

export function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  if (typeof value === "object" && "toNumber" in (value as object)) {
    return (value as { toNumber: () => number }).toNumber();
  }
  return Number(value);
}

// ─────────────────────────────────────────────────────────────────────────────
// Station code generation
// ─────────────────────────────────────────────────────────────────────────────

export async function generateStationCode(): Promise<string> {
  const latest = await prisma.station.findFirst({
    where: { code: { startsWith: "STN-" } },
    orderBy: { code: "desc" },
    select: { code: true },
  });

  const match = latest?.code.match(/STN-(\d+)/);
  const next = (match ? parseInt(match[1], 10) : 0) + 1;
  return `STN-${String(next).padStart(3, "0")}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Serialization helpers
// ─────────────────────────────────────────────────────────────────────────────

type TerminalWithLinkedStation = Terminal & {
  linkedStation?: { name: string } | null;
};

export function serializeTerminal(terminal: TerminalWithLinkedStation) {
  const name =
    terminal.isLinkedStation && terminal.linkedStation
      ? terminal.linkedStation.name
      : terminal.name;

  return {
    id: terminal.id,
    name,
    isStation: terminal.isLinkedStation,
    linkedStationId: terminal.linkedStationId,
    isDeparture: terminal.isDeparture,
    isArrival: terminal.isArrival,
    distanceKm: toNumber(terminal.distanceKm),
    roadType: roadTypeFromEnum(terminal.roadType),
    asphaltKm: terminal.asphaltKm === null ? null : toNumber(terminal.asphaltKm),
    gravelKm: terminal.gravelKm === null ? null : toNumber(terminal.gravelKm),
    isDeleted: terminal.isDeleted,
    deletedAt: terminal.deletedAt,
    createdAt: terminal.createdAt,
    updatedAt: terminal.updatedAt,
  };
}

type StationWithCounts = Station & {
  terminalsAsOrigin: TerminalWithLinkedStation[];
  _count?: {
    terminalsAsOrigin: number;
    employees: number;
    posMachines: number;
  };
};

export function serializeStation(station: StationWithCounts) {
  return {
    id: station.id,
    code: station.code,
    name: station.name,
    region: station.region,
    zone: station.zone,
    location: station.location,
    isDeleted: station.isDeleted,
    deletedAt: station.deletedAt,
    createdAt: station.createdAt,
    updatedAt: station.updatedAt,
    terminals: station.terminalsAsOrigin.map(serializeTerminal),
    counts: station._count ?? {
      terminalsAsOrigin: station.terminalsAsOrigin.length,
      employees: 0,
      posMachines: 0,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Common response helpers
// ─────────────────────────────────────────────────────────────────────────────

export function ok<T>(data: T, init?: ResponseInit) {
  return Response.json(data, { status: 200, ...init });
}

export function created<T>(data: T) {
  return Response.json(data, { status: 201 });
}

export function badRequest(message: string, errors?: unknown) {
  return Response.json({ error: "Bad Request", message, errors }, { status: 400 });
}

export function unauthorized(message = "Unauthorized") {
  return Response.json({ error: "Unauthorized", message }, { status: 401 });
}

export function notFound(resource = "Resource") {
  return Response.json({ error: "Not Found", message: `${resource} not found.` }, { status: 404 });
}

export function serverError(error: unknown) {
  const message = error instanceof Error ? error.message : "Internal server error";
  // eslint-disable-next-line no-console
  console.error("API error:", error);
  return Response.json({ error: "Internal Server Error", message }, { status: 500 });
}

export function parseIncludeDeleted(searchParams: URLSearchParams): boolean {
  const value = searchParams.get("includeDeleted");
  return value === "true" || value === "1";
}
