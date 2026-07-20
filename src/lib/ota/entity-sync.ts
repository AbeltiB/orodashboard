// src/lib/ota/entity-sync.ts
// Shared sync engine for the three OTA "mirror" tables (employees, terminals,
// vehicles) — same log-then-walk-then-record shape as sync.ts's sales trip
// sync, simplified: these are stable reference tables (unlike trips, no
// evidence of the source's pagination reshuffling mid-walk), so one full
// pass per run is enough, and rows get real upserts (status/assignment
// changes), not just insert-if-new.
//
// Upserts run with limited concurrency (10) to stay well under the Supabase
// session-pooler's connection cap (pool_size: 15 — confirmed live via
// "max clients reached" errors at higher concurrency).
import { prisma } from "@/lib/prisma";
import { Prisma, type $Enums } from "@/generated/prisma/client";
import {
  otaConfigFromEnv,
  OtaRateLimitError,
  fetchAllOtaCompanyUsers,
  fetchAllOtaTerminals,
  fetchAllOtaVehicles,
  createOtaCompanyUser,
  type OtaConfig,
  type OtaCompanyUser,
  type OtaTerminalRaw,
  type OtaVehicleRaw,
  type CreateOtaCompanyUserInput,
} from "./client";

const STALE_RUN_MS = 30 * 60 * 1000;
const UPSERT_CONCURRENCY = 10;

export type SyncProgressEvent =
  | { type: "start" }
  | { type: "page"; page: number; pages: number; rowsSoFar: number }
  | { type: "upserting"; done: number; total: number }
  | { type: "skipped"; reason: string }
  | { type: "rate-limited"; retryAfterSeconds: number }
  | { type: "done" };

export type RunOtaSyncOptions = {
  source: $Enums.SyncSource;
  triggeredBy?: string | null;
  onProgress?: (event: SyncProgressEvent) => void;
};

export type OtaSyncResult = {
  logId: string;
  status: $Enums.SyncStatus;
  pagesFetched: number;
  rowsFetched: number;
  rowsCreated: number;
  rowsUpdated: number;
  sourceTotal: number | null;
  ourTotal: number | null;
  rateLimitedUntil: Date | null;
  errorMessage: string | null;
};

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

type Deps<TRaw> = {
  countRows: () => Promise<number>;
  existingIds: (ids: string[]) => Promise<Set<string>>;
  fetchAll: (
    config: OtaConfig,
    onPage: (page: number, pages: number, rowsSoFar: number) => void
  ) => Promise<{ rows: TRaw[]; pagesFetched: number; sourceTotal: number }>;
  getId: (row: TRaw) => string;
  upsertRow: (id: string, data: Record<string, unknown>) => Promise<void>;
  mapRow: (row: TRaw) => Record<string, unknown>;
};

async function runOtaEntitySync<TRaw>(
  entity: $Enums.OtaSyncEntity,
  options: RunOtaSyncOptions,
  deps: Deps<TRaw>
): Promise<OtaSyncResult> {
  const startedAt = new Date();
  const ourTotalBefore = await deps.countRows();

  const staleCutoff = new Date(startedAt.getTime() - STALE_RUN_MS);
  const inProgress = await prisma.otaSyncLog.findFirst({
    where: { entity, finishedAt: null, startedAt: { gt: staleCutoff } },
    orderBy: { startedAt: "desc" },
  });
  if (inProgress) {
    return skippedResult(entity, options, ourTotalBefore, `Sync ${inProgress.id} was already in progress (started ${inProgress.startedAt.toISOString()}).`);
  }

  const lastRateLimited = await prisma.otaSyncLog.findFirst({
    where: { entity, rateLimitedUntil: { gt: startedAt } },
    orderBy: { startedAt: "desc" },
  });
  if (lastRateLimited?.rateLimitedUntil) {
    return skippedResult(entity, options, ourTotalBefore, `Still cooling down from a rate limit until ${lastRateLimited.rateLimitedUntil.toISOString()}.`);
  }

  const log = await prisma.otaSyncLog.create({
    data: { entity, source: options.source, triggeredBy: options.triggeredBy ?? null, status: "SUCCESS" },
  });

  let pagesFetched = 0;
  let rowsFetched = 0;
  let rowsCreated = 0;
  let rowsUpdated = 0;
  let sourceTotal: number | null = null;
  let rateLimitedUntil: Date | null = null;
  let errorMessage: string | null = null;
  let status: $Enums.SyncStatus = "SUCCESS";

  try {
    const config = otaConfigFromEnv();
    options.onProgress?.({ type: "start" });

    const fetched = await deps.fetchAll(config, (page, pages, rowsSoFar) =>
      options.onProgress?.({ type: "page", page, pages, rowsSoFar })
    );
    pagesFetched = fetched.pagesFetched;
    rowsFetched = fetched.rows.length;
    sourceTotal = fetched.sourceTotal;

    const ids = fetched.rows.map(deps.getId);
    const existing = await deps.existingIds(ids);

    let done = 0;
    for (const batch of chunk(fetched.rows, UPSERT_CONCURRENCY)) {
      await Promise.all(
        batch.map(async (row) => {
          const id = deps.getId(row);
          await deps.upsertRow(id, deps.mapRow(row));
          if (existing.has(id)) rowsUpdated++;
          else rowsCreated++;
        })
      );
      done += batch.length;
      options.onProgress?.({ type: "upserting", done, total: fetched.rows.length });
    }
    options.onProgress?.({ type: "done" });
  } catch (error) {
    if (error instanceof OtaRateLimitError) {
      status = "RATE_LIMITED";
      const bufferSeconds = 5 * 60;
      rateLimitedUntil = new Date(Date.now() + (error.retryAfterSeconds + bufferSeconds) * 1000);
      errorMessage = error.message;
      options.onProgress?.({ type: "rate-limited", retryAfterSeconds: error.retryAfterSeconds });
    } else {
      status = rowsCreated > 0 || rowsUpdated > 0 ? "PARTIAL" : "FAILED";
      errorMessage = error instanceof Error ? error.message : String(error);
    }
  }

  const ourTotalAfter = await deps.countRows();

  await prisma.otaSyncLog.update({
    where: { id: log.id },
    data: { status, pagesFetched, rowsFetched, rowsCreated, rowsUpdated, sourceTotal, ourTotal: ourTotalAfter, rateLimitedUntil, errorMessage, finishedAt: new Date() },
  });

  return { logId: log.id, status, pagesFetched, rowsFetched, rowsCreated, rowsUpdated, sourceTotal, ourTotal: ourTotalAfter, rateLimitedUntil, errorMessage };
}

async function skippedResult(
  entity: $Enums.OtaSyncEntity,
  options: RunOtaSyncOptions,
  ourTotal: number,
  reason: string
): Promise<OtaSyncResult> {
  options.onProgress?.({ type: "skipped", reason });
  const log = await prisma.otaSyncLog.create({
    data: {
      entity, source: options.source, triggeredBy: options.triggeredBy ?? null,
      status: "SKIPPED", ourTotal, finishedAt: new Date(), errorMessage: reason,
    },
  });
  return {
    logId: log.id, status: "SKIPPED", pagesFetched: 0, rowsFetched: 0, rowsCreated: 0, rowsUpdated: 0,
    sourceTotal: null, ourTotal, rateLimitedUntil: null, errorMessage: reason,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// EMPLOYEES
// ─────────────────────────────────────────────────────────────────────────────

function mapEmployeeRow(cu: OtaCompanyUser): Record<string, unknown> {
  return {
    companyId: cu.company_id,
    userId: cu.user_id,
    fullName: cu.user?.full_name ?? "(unknown)",
    phone: cu.user?.phone ?? null,
    email: cu.user?.email ?? null,
    position: cu.position,
    department: cu.department,
    employeeIdExternal: cu.employee_id,
    joiningDate: cu.joining_date ? new Date(cu.joining_date) : null,
    endDate: cu.end_date ? new Date(cu.end_date) : null,
    isActive: cu.is_active,
    roleName: cu.user?.role?.name ?? null,
    roleLabel: cu.user?.role?.description ?? null,
    userStatus: cu.user?.status ?? null,
    terminalId: cu.user?.terminal_id ?? null,
    terminalName: cu.user?.terminal?.name ?? null,
    raw: cu as unknown as Prisma.InputJsonValue,
  };
}

// Creates a real account in OTA (external write, not a mirror), then
// immediately upserts the returned record into our local mirror using the
// same mapper the sync uses, so it shows up without waiting for a re-sync.
export async function createOtaEmployee(input: CreateOtaCompanyUserInput) {
  const config = otaConfigFromEnv();
  const created = await createOtaCompanyUser(config, input);
  const data = mapEmployeeRow(created);
  return prisma.otaEmployee.upsert({
    where: { id: created.id },
    create: { id: created.id, ...data },
    update: data,
  } as Prisma.OtaEmployeeUpsertArgs);
}

export async function runOtaEmployeeSync(options: RunOtaSyncOptions): Promise<OtaSyncResult> {
  return runOtaEntitySync<OtaCompanyUser>("EMPLOYEES", options, {
    countRows: () => prisma.otaEmployee.count(),
    existingIds: async (ids) =>
      new Set((await prisma.otaEmployee.findMany({ where: { id: { in: ids } }, select: { id: true } })).map((r) => r.id)),
    fetchAll: (config, onPage) => fetchAllOtaCompanyUsers(config, { onPage }),
    getId: (row) => row.id,
    mapRow: mapEmployeeRow,
    upsertRow: async (id, data) => {
      await prisma.otaEmployee.upsert({ where: { id }, create: { id, ...data }, update: data } as Prisma.OtaEmployeeUpsertArgs);
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// TERMINALS
// ─────────────────────────────────────────────────────────────────────────────

function mapTerminalRow(t: OtaTerminalRaw): Record<string, unknown> {
  return {
    name: t.name,
    address: t.address,
    status: t.status,
    zoneName: t.zone?.name ?? null,
    woredaName: t.woreda?.name ?? null,
    cityName: t.city?.name ?? null,
    companyNames: t.companies?.length ? t.companies.map((c) => c.name).join(", ") : null,
    raw: t as unknown as Prisma.InputJsonValue,
  };
}

export async function runOtaTerminalSync(options: RunOtaSyncOptions): Promise<OtaSyncResult> {
  return runOtaEntitySync<OtaTerminalRaw>("TERMINALS", options, {
    countRows: () => prisma.otaTerminal.count(),
    existingIds: async (ids) =>
      new Set((await prisma.otaTerminal.findMany({ where: { id: { in: ids } }, select: { id: true } })).map((r) => r.id)),
    fetchAll: (config, onPage) => fetchAllOtaTerminals(config, { onPage }),
    getId: (row) => row.id,
    mapRow: mapTerminalRow,
    upsertRow: async (id, data) => {
      await prisma.otaTerminal.upsert({ where: { id }, create: { id, ...data }, update: data } as Prisma.OtaTerminalUpsertArgs);
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// VEHICLES
// ─────────────────────────────────────────────────────────────────────────────

function mapVehicleRow(v: OtaVehicleRaw): Record<string, unknown> {
  // Confirmed live: essentially always 0 or 1 route per vehicle (none of
  // ~19.8k sampled had more than one) — the first entry is the vehicle's
  // current route, if it has one.
  const route = v.vehicleTerminalDestinations?.[0]?.terminalDestination;
  return {
    plateNumber: v.plate_number,
    plateRegion: v.plate_region,
    seatCapacity: v.seat_capacity,
    status: v.status,
    isAssignedToRoute: v.is_assigned_to_route,
    driverName: v.driver_name,
    driverLicenceNumber: v.driver_licence_number,
    fleetTypeName: v.fleetType?.name ?? null,
    associationName: v.association?.name ?? null,
    assignedTerminalId: v.assigned_terminal_id,
    assignedTerminalName: v.assignedTerminal?.name ?? null,
    vehicleLevelName: v.vehicleLevel?.name ?? null,
    departureTerminalName: route?.departureTerminal?.name ?? null,
    arrivalTerminalName: route?.arrivalTerminal?.name ?? null,
    routeDistanceKm: route?.distance ? new Prisma.Decimal(route.distance) : null,
    raw: v as unknown as Prisma.InputJsonValue,
  };
}

export async function runOtaVehicleSync(options: RunOtaSyncOptions): Promise<OtaSyncResult> {
  return runOtaEntitySync<OtaVehicleRaw>("VEHICLES", options, {
    countRows: () => prisma.otaVehicle.count(),
    existingIds: async (ids) =>
      new Set((await prisma.otaVehicle.findMany({ where: { id: { in: ids } }, select: { id: true } })).map((r) => r.id)),
    fetchAll: (config, onPage) => fetchAllOtaVehicles(config, { onPage }),
    getId: (row) => row.id,
    mapRow: mapVehicleRow,
    upsertRow: async (id, data) => {
      await prisma.otaVehicle.upsert({ where: { id }, create: { id, ...data }, update: data } as Prisma.OtaVehicleUpsertArgs);
    },
  });
}
