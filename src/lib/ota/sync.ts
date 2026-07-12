// src/lib/ota/sync.ts
// Pulls trips from the OTA source system and mirrors them into SalesTrip,
// logging every run (manual or automatic) to SalesSyncLog.
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { fetchAllOtaTrips, otaConfigFromEnv, type OtaTrip } from "./client";

// Re-fetch a little before the last-seen trip time to catch rows that were
// inserted late on the source side (e.g. a driver's device synced offline
// data after the fact) — createMany's skipDuplicates makes this overlap
// free of duplicates, it just costs a few extra already-seen rows per sync.
const OVERLAP_MS = 15 * 60 * 1000;

function toDecimal(value: string | undefined | null): Prisma.Decimal {
  return new Prisma.Decimal(value && value.trim() !== "" ? value : "0");
}
function toInt(value: string | undefined | null): number {
  const n = parseInt(value ?? "", 10);
  return Number.isFinite(n) ? n : 0;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function mapTripData(t: OtaTrip) {
  return {
    date: new Date(t.Date),
    distanceKm: toDecimal(t.trip_Distance),
    tariff: toDecimal(t.trip_tarif),
    serviceCharge: toDecimal(t.trip_Service_Charge),
    passengers: toInt(t.Passengers),
    level: t.Level ?? "",
    companyId: t.company_id ?? "",
    companyName: t.company_name ?? "",
    departureTerminalName: t.departure_terminal_name ?? "",
    arrivalTerminalName: t.arrival_terminal_name ?? "",
    employeeExternalId: t.employee?.id ?? null,
    employeeName: t.employee?.name ?? null,
    employeeEmail: t.employee?.email ?? null,
    vehicleExternalId: t.vehicle?.id ?? null,
    vehiclePlateNo: t.vehicle?.plate_no ?? null,
    vehiclePlateCode: t.vehicle?.plate_code ?? null,
    vehicleFleetCategory: t.vehicle?.fleet_category ?? null,
    vehicleAssociation: t.vehicle?.association ?? null,
    vehicleLevel: t.vehicle?.level ?? null,
  };
}

export type RunSyncOptions = {
  source: "MANUAL" | "AUTO";
  triggeredBy?: string | null;
};

export type SyncResult = {
  logId: string;
  status: "SUCCESS" | "FAILED" | "PARTIAL";
  pagesFetched: number;
  rowsFetched: number;
  rowsCreated: number;
  rowsUpdated: number;
  windowFrom: Date | null;
  windowTo: Date;
  errorMessage: string | null;
};

export async function runSalesSync(options: RunSyncOptions): Promise<SyncResult> {
  const to = new Date();

  const latest = await prisma.salesTrip.findFirst({ orderBy: { date: "desc" }, select: { date: true } });
  const windowFrom = latest ? new Date(latest.date.getTime() - OVERLAP_MS) : null;

  const log = await prisma.salesSyncLog.create({
    data: {
      source: options.source,
      triggeredBy: options.triggeredBy ?? null,
      windowFrom,
      windowTo: to,
      status: "SUCCESS",
    },
  });

  let rowsCreated = 0;
  let rowsUpdated = 0;
  let pagesFetched = 0;
  let rows: OtaTrip[] = [];
  let errorMessage: string | null = null;
  let status: SyncResult["status"] = "SUCCESS";

  try {
    const config = otaConfigFromEnv();
    const fetched = await fetchAllOtaTrips(config, { from: windowFrom ?? undefined, to });
    rows = fetched.rows;
    pagesFetched = fetched.pagesFetched;

    // The source API's pagination isn't guaranteed stable while its own
    // table keeps growing mid-walk (confirmed: rows aren't returned in any
    // consistent date order) — the same trip can land on two different
    // pages of one fetch. Dedupe by id before touching the DB so that
    // doesn't inflate rowsCreated.
    const distinctRows = [...new Map(rows.map((r) => [r.id, r])).values()];

    // One query (single ANY() array param, not one bind param per id) to
    // know which ids already exist — matters on the first full backfill
    // (tens of thousands of rows), not just the small incremental windows.
    const existingIds = new Set(
      (await prisma.salesTrip.findMany({
        where: { id: { in: distinctRows.map((r) => r.id) } },
        select: { id: true },
      })).map((r) => r.id)
    );

    const newRows = distinctRows.filter((r) => !existingIds.has(r.id));
    // A completed trip's own fields don't change after the fact — rows
    // we've already synced are treated as immutable and simply skipped
    // rather than rewritten, so the overlap window doesn't cost a write.
    rowsUpdated = distinctRows.length - newRows.length;

    // Chunked bulk insert instead of one upsert per row — a single
    // createMany keeps this to a handful of round-trips even for a
    // 17k+ row backfill (Postgres caps bind params per statement, hence
    // the chunk size headroom for ~21 columns/row). createMany's own
    // returned count is the ground truth for rowsCreated, since
    // skipDuplicates can still silently drop a same-fetch collision that
    // slipped past the id-based dedupe above (e.g. a genuine race with
    // another sync run).
    for (const batch of chunk(newRows, 1000)) {
      const result = await prisma.salesTrip.createMany({
        data: batch.map((trip) => ({ id: trip.id, lastSyncId: log.id, ...mapTripData(trip) })),
        skipDuplicates: true,
      });
      rowsCreated += result.count;
    }
  } catch (error) {
    status = rows.length > 0 ? "PARTIAL" : "FAILED";
    errorMessage = error instanceof Error ? error.message : String(error);
  }

  await prisma.salesSyncLog.update({
    where: { id: log.id },
    data: {
      status,
      pagesFetched,
      rowsFetched: rows.length,
      rowsCreated,
      rowsUpdated,
      errorMessage,
      finishedAt: new Date(),
    },
  });

  return {
    logId: log.id,
    status,
    pagesFetched,
    rowsFetched: rows.length,
    rowsCreated,
    rowsUpdated,
    windowFrom,
    windowTo: to,
    errorMessage,
  };
}
