// src/lib/ota/sync.ts
// Pulls trips from the OTA source system and mirrors them into SalesTrip,
// logging every run (manual or automatic) to SalesSyncLog.
//
// The source system's own pagination is not trusted to filter by date —
// every run walks its ENTIRE unfiltered table. Worse, a single full walk
// isn't even trusted to be *complete*: confirmed against live data that the
// source has no stable sort order, so while our multi-minute walk is
// running and its table keeps getting written to, `page`/`limit` offsets
// can re-show already-seen rows and skip others. A single pass on 17.9k
// rows only reached ~63% distinct coverage in testing.
//
// So each run loops full passes — re-walking the entire table — until
// either we've caught up to the source's own reported total, a pass adds
// zero new rows (plateaued, further passes won't help), or a safety cap is
// hit. The one optimization applied is a cheap up-front check of the
// source's own reported row total: if it already matches ours, there is
// nothing new by definition and the walk is skipped entirely. That's a
// row-count comparison, not a date filter, so it doesn't rely on any trust
// in the source's date handling.
//
// The source also hard rate-limits: confirmed live, ~720 requests across
// several passes triggered an HTTP 429 with a 900s (15 min) lockout. So
// passes are capped conservatively, and a 429 is treated as a hard stop —
// not retried — with the lockout window recorded so the *next* run (which,
// on a 15-minute cron, could otherwise fire right into the same lockout)
// skips outright instead of tripping it again.
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { fetchAllOtaTrips, fetchOtaTripsPage, otaConfigFromEnv, otaLogin, OtaRateLimitError, type OtaTrip } from "./client";

// If a previous run is still marked in-progress and younger than this, skip
// this trigger rather than run concurrent walks.
const STALE_RUN_MS = 30 * 60 * 1000;

// Safety caps on the multi-pass convergence loop. Kept conservative (2
// passes ~= 360 requests) because a full single pass (~180 requests) is
// known-safe, and stacking passes is what triggered the 429 in testing —
// full convergence happens gradually across successive cron runs instead
// of forcing it inside one.
const MAX_PASSES = 2;
const MAX_LOOP_MS = 6 * 60 * 1000;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function toDecimal(value: string | undefined | null): Prisma.Decimal {
  return new Prisma.Decimal(value && value.trim() !== "" ? value : "0");
}
function toInt(value: string | undefined | null): number {
  const n = parseInt(value ?? "", 10);
  return Number.isFinite(n) ? n : 0;
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

// One walk of every page, deduped against what's already on file, written
// in bulk. Returns what this single pass accomplished. Lets OtaRateLimitError
// propagate — the caller decides what to do about it.
async function performOneWalk(
  config: ReturnType<typeof otaConfigFromEnv>,
  logId: string
): Promise<{ rowsFetched: number; pagesFetched: number; rowsCreated: number; rowsUpdated: number }> {
  const fetched = await fetchAllOtaTrips(config, {});

  // The same trip can land on two different pages of one walk while the
  // source table is being written to mid-walk — dedupe before touching
  // the DB so that doesn't inflate rowsCreated.
  const distinctRows = [...new Map(fetched.rows.map((r) => [r.id, r])).values()];

  // One query (single ANY() array param, not one bind param per id) to
  // know which ids already exist.
  const existingIds = new Set(
    (await prisma.salesTrip.findMany({
      where: { id: { in: distinctRows.map((r) => r.id) } },
      select: { id: true },
    })).map((r) => r.id)
  );

  const newRows = distinctRows.filter((r) => !existingIds.has(r.id));
  const rowsUpdated = distinctRows.length - newRows.length;

  // Chunked bulk insert instead of one upsert per row (Postgres caps bind
  // params per statement, hence the chunk size headroom for ~21
  // columns/row). createMany's own returned count is the ground truth for
  // rowsCreated.
  let rowsCreated = 0;
  for (const batch of chunk(newRows, 1000)) {
    const result = await prisma.salesTrip.createMany({
      data: batch.map((trip) => ({ id: trip.id, lastSyncId: logId, ...mapTripData(trip) })),
      skipDuplicates: true,
    });
    rowsCreated += result.count;
  }

  return { rowsFetched: fetched.rows.length, pagesFetched: fetched.pagesFetched, rowsCreated, rowsUpdated };
}

export type RunSyncOptions = {
  source: "MANUAL" | "AUTO";
  triggeredBy?: string | null;
};

export type SyncResult = {
  logId: string;
  status: "SUCCESS" | "FAILED" | "PARTIAL" | "SKIPPED" | "RATE_LIMITED";
  passes: number;
  pagesFetched: number;
  rowsFetched: number;
  rowsCreated: number;
  rowsUpdated: number;
  sourceTotal: number | null;
  ourTotal: number | null;
  rateLimitedUntil: Date | null;
  windowFrom: Date | null;
  windowTo: Date;
  errorMessage: string | null;
};

async function skippedResult(
  options: RunSyncOptions,
  startedAt: Date,
  windowFrom: Date | null,
  ourTotal: number,
  status: "SKIPPED" | "RATE_LIMITED",
  errorMessage: string,
  extra: { sourceTotal?: number | null; rateLimitedUntil?: Date | null } = {}
): Promise<SyncResult> {
  const log = await prisma.salesSyncLog.create({
    data: {
      source: options.source,
      triggeredBy: options.triggeredBy ?? null,
      windowFrom,
      windowTo: startedAt,
      status,
      ourTotal,
      sourceTotal: extra.sourceTotal ?? null,
      rateLimitedUntil: extra.rateLimitedUntil ?? null,
      finishedAt: new Date(),
      errorMessage,
    },
  });
  return {
    logId: log.id, status, passes: 0, pagesFetched: 0, rowsFetched: 0, rowsCreated: 0, rowsUpdated: 0,
    sourceTotal: extra.sourceTotal ?? null, ourTotal, rateLimitedUntil: extra.rateLimitedUntil ?? null,
    windowFrom, windowTo: startedAt, errorMessage,
  };
}

export async function runSalesSync(options: RunSyncOptions): Promise<SyncResult> {
  const startedAt = new Date();

  const latest = await prisma.salesTrip.findFirst({ orderBy: { date: "desc" }, select: { date: true } });
  const ourTotalBefore = await prisma.salesTrip.count();

  const staleCutoff = new Date(startedAt.getTime() - STALE_RUN_MS);
  const inProgress = await prisma.salesSyncLog.findFirst({
    where: { finishedAt: null, startedAt: { gt: staleCutoff } },
    orderBy: { startedAt: "desc" },
  });
  if (inProgress) {
    return skippedResult(
      options, startedAt, latest?.date ?? null, ourTotalBefore, "SKIPPED",
      `Sync ${inProgress.id} was already in progress (started ${inProgress.startedAt.toISOString()}).`
    );
  }

  const lastRateLimited = await prisma.salesSyncLog.findFirst({
    where: { rateLimitedUntil: { gt: startedAt } },
    orderBy: { startedAt: "desc" },
  });
  if (lastRateLimited?.rateLimitedUntil) {
    return skippedResult(
      options, startedAt, latest?.date ?? null, ourTotalBefore, "SKIPPED",
      `Still cooling down from a rate limit until ${lastRateLimited.rateLimitedUntil.toISOString()}.`
    );
  }

  const log = await prisma.salesSyncLog.create({
    data: {
      source: options.source,
      triggeredBy: options.triggeredBy ?? null,
      windowFrom: latest?.date ?? null,
      windowTo: startedAt,
      status: "SUCCESS",
    },
  });

  let passes = 0;
  let pagesFetched = 0;
  let rowsFetched = 0;
  let rowsCreated = 0;
  let rowsUpdated = 0;
  let sourceTotal: number | null = null;
  let rateLimitedUntil: Date | null = null;
  let errorMessage: string | null = null;
  let status: SyncResult["status"] = "SUCCESS";

  try {
    const config = otaConfigFromEnv();

    // Cheap unfiltered probe — one request, just to read the source's own
    // row count before committing to a full walk.
    const { token } = await otaLogin(config);
    const probe = await fetchOtaTripsPage(config, token, 1, 1);
    sourceTotal = probe.total;

    if (sourceTotal === ourTotalBefore) {
      status = "SKIPPED";
    } else {
      const loopStart = Date.now();
      while (passes < MAX_PASSES && Date.now() - loopStart < MAX_LOOP_MS) {
        passes++;
        const pass = await performOneWalk(config, log.id);
        pagesFetched += pass.pagesFetched;
        rowsFetched += pass.rowsFetched;
        rowsCreated += pass.rowsCreated;
        rowsUpdated += pass.rowsUpdated;

        const ourTotalNow = await prisma.salesTrip.count();
        const caughtUp = sourceTotal !== null && ourTotalNow >= sourceTotal;
        const plateaued = pass.rowsCreated === 0;
        if (caughtUp || plateaued) break;
      }

      const ourTotalFinal = await prisma.salesTrip.count();
      status = sourceTotal !== null && ourTotalFinal >= sourceTotal ? "SUCCESS" : "PARTIAL";
    }
  } catch (error) {
    if (error instanceof OtaRateLimitError) {
      status = "RATE_LIMITED";
      // Confirmed live: even the login endpoint sits behind this same
      // limiter, and an attempt made while still locked out appears to
      // reset the countdown rather than just being rejected — so this adds
      // real margin on top of their own retryAfter rather than cutting it
      // close, to avoid a retry-resets-the-clock loop.
      const bufferSeconds = 5 * 60;
      rateLimitedUntil = new Date(Date.now() + (error.retryAfterSeconds + bufferSeconds) * 1000);
      errorMessage = error.message;
    } else {
      status = rowsCreated > 0 || rowsUpdated > 0 ? "PARTIAL" : "FAILED";
      errorMessage = error instanceof Error ? error.message : String(error);
    }
  }

  const ourTotalAfter = await prisma.salesTrip.count();

  await prisma.salesSyncLog.update({
    where: { id: log.id },
    data: {
      status,
      passes,
      pagesFetched,
      rowsFetched,
      rowsCreated,
      rowsUpdated,
      sourceTotal,
      ourTotal: ourTotalAfter,
      rateLimitedUntil,
      errorMessage,
      finishedAt: new Date(),
    },
  });

  return {
    logId: log.id,
    status,
    passes,
    pagesFetched,
    rowsFetched,
    rowsCreated,
    rowsUpdated,
    sourceTotal,
    ourTotal: ourTotalAfter,
    rateLimitedUntil,
    windowFrom: latest?.date ?? null,
    windowTo: startedAt,
    errorMessage,
  };
}
