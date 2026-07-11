// src/lib/api-utils.ts
import { $Enums, type Terminal, type Station, type Employee, type PosMachine } from "@/generated/prisma/client";
import { prisma } from "./prisma";

// ─────────────────────────────────────────────────────────────────────────────
// Enum maps
// ─────────────────────────────────────────────────────────────────────────────

export const REGION_VALUES = [
  "ADDIS_ABABA", "OROMIA", "AMHARA", "TIGRAY", "SNNPR", "AFAR",
  "SOMALI", "BENISHANGUL_GUMUZ", "GAMBELA", "HARARI", "DIRE_DAWA", "SIDAMA",
] as const;

export const ROAD_TYPE_INPUTS = ["asphalt", "gravel", "mixed"] as const;

const roadTypeInputToEnum: Record<(typeof ROAD_TYPE_INPUTS)[number], $Enums.RoadType> = {
  asphalt: "ASPHALT", gravel: "GRAVEL", mixed: "MIXED",
};
const roadTypeEnumToInput: Record<$Enums.RoadType, (typeof ROAD_TYPE_INPUTS)[number]> = {
  ASPHALT: "asphalt", GRAVEL: "gravel", MIXED: "mixed",
};

export function roadTypeToEnum(v: (typeof ROAD_TYPE_INPUTS)[number]): $Enums.RoadType {
  return roadTypeInputToEnum[v];
}
export function roadTypeFromEnum(v: $Enums.RoadType): (typeof ROAD_TYPE_INPUTS)[number] {
  return roadTypeEnumToInput[v] ?? "asphalt";
}

export const BUS_TYPE_VALUES = ["BUS", "MIDBUS", "MINIBUS"] as const;
export const BUS_LEVEL_VALUES = ["LEVEL_1", "LEVEL_2", "LEVEL_3"] as const;
export const EMPLOYEE_ROLE_VALUES = ["SUPERVISOR", "TICKETER", "CASHIER"] as const;
export const SEX_VALUES = ["MALE", "FEMALE"] as const;
export const POS_STATUS_VALUES = ["ACTIVE", "IDLE", "MAINTENANCE", "DECOMMISSIONED"] as const;
export const DELIVERY_METHOD_VALUES = ["BANK_TRANSFER", "CHEQUE", "TELEBIRR", "OTHER"] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Type coercion
// ─────────────────────────────────────────────────────────────────────────────

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
// Code generators
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

export async function generateEmployeeCode(): Promise<string> {
  const latest = await prisma.employee.findFirst({
    where: { code: { startsWith: "EMP-" } },
    orderBy: { code: "desc" },
    select: { code: true },
  });
  const match = latest?.code.match(/EMP-(\d+)/);
  const next = (match ? parseInt(match[1], 10) : 0) + 1;
  return `EMP-${String(next).padStart(3, "0")}`;
}

export async function generatePosCode(): Promise<string> {
  const latest = await prisma.posMachine.findFirst({
    where: { code: { startsWith: "POS-" } },
    orderBy: { code: "desc" },
    select: { code: true },
  });
  const match = latest?.code.match(/POS-(\d+)/);
  const next = (match ? parseInt(match[1], 10) : 0) + 1;
  return `POS-${String(next).padStart(3, "0")}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Serializers
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

type EmployeeWithRelations = Employee & {
  station?: { id: string; name: string; code: string } | null;
  posMachines?: { id: string; code: string; serial: string }[];
};

export function serializeEmployee(e: EmployeeWithRelations) {
  return {
    id: e.id,
    code: e.code,
    firstName: e.firstName,
    middleName: e.middleName,
    lastName: e.lastName,
    fullName: [e.firstName, e.middleName, e.lastName].filter(Boolean).join(" "),
    phone: e.phone,
    email: e.email,
    fan: e.fan,
    accountNumber: e.accountNumber,
    role: e.role,
    sex: e.sex,
    basicSalary: toNumber(e.basicSalary),
    employmentDate: e.employmentDate,
    stationId: e.stationId,
    station: e.station ?? null,
    posMachines: e.posMachines ?? [],
    isDeleted: e.isDeleted,
    deletedAt: e.deletedAt,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
  };
}

type PosMachineWithRelations = PosMachine & {
  station?: { id: string; name: string; code: string } | null;
  employee?: { id: string; code: string; firstName: string; lastName: string } | null;
};

export function serializePosMachine(p: PosMachineWithRelations) {
  return {
    id: p.id,
    code: p.code,
    make: p.make,
    model: p.model,
    serial: p.serial,
    status: p.status,
    appVersion: p.appVersion,
    remark: p.remark,
    stationId: p.stationId,
    station: p.station ?? null,
    employeeId: p.employeeId,
    employee: p.employee
      ? {
          id: p.employee.id,
          code: p.employee.code,
          name: `${p.employee.firstName} ${p.employee.lastName}`,
        }
      : null,
    isDeleted: p.isDeleted,
    deletedAt: p.deletedAt,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Response helpers
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

export function forbidden(message = "Forbidden") {
  return Response.json({ error: "Forbidden", message }, { status: 403 });
}

export function notFound(resource = "Resource") {
  return Response.json(
    { error: "Not Found", message: `${resource} not found.` },
    { status: 404 }
  );
}

export function conflict(message: string) {
  return Response.json({ error: "Conflict", message }, { status: 409 });
}

export function serverError(error: unknown) {
  console.error("API error:", error);
  const message =
    process.env.NODE_ENV !== "production" && error instanceof Error
      ? error.message
      : "Internal server error";
  return Response.json({ error: "Internal Server Error", message }, { status: 500 });
}

export function parseIncludeDeleted(searchParams: URLSearchParams): boolean {
  const value = searchParams.get("includeDeleted");
  return value === "true" || value === "1";
}

export function parsePagination(
  searchParams: URLSearchParams,
  defaultLimit = 100,
  maxLimit = 500
) {
  const offset = Math.max(0, parseInt(searchParams.get("offset") ?? "0", 10) || 0);
  const limit = Math.min(
    maxLimit,
    Math.max(1, parseInt(searchParams.get("limit") ?? String(defaultLimit), 10) || defaultLimit)
  );
  return { offset, limit };
}