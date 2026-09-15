// src/lib/telegram/reports.ts
// Builds the actual text content of each report type. All dates are
// resolved against Africa/Addis_Ababa wall-clock time (the business's one
// timezone, no DST) but bucketed as UTC-midnight days — the same convention
// already used by SalesTrip filtering and Deposit.date (see src/lib/deposits.ts)
// so a report's numbers always match what the Sales/Deposits pages show for
// that same calendar day.
import { prisma } from "@/lib/prisma";
import { toNumber } from "@/lib/api-utils";
import { getStationMatchNames } from "@/lib/cashier-sales-scope";
import { dateToEthiopian, ethiopianToGregorian, ETHIOPIAN_MONTH_NAMES } from "@/lib/ethiopian-calendar";
import type { $Enums } from "@/generated/prisma/client";

const ADDIS_TZ = "Africa/Addis_Ababa";

function addisDateParts(instant: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: ADDIS_TZ, year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(instant)
    .reduce<Record<string, string>>((acc, p) => ({ ...acc, [p.type]: p.value }), {});
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day) };
}

export function addisNowParts(instant: Date = new Date()): { year: number; month: number; day: number; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ADDIS_TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  })
    .formatToParts(instant)
    .reduce<Record<string, string>>((acc, p) => ({ ...acc, [p.type]: p.value }), {});
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day), hour: Number(parts.hour), minute: Number(parts.minute) };
}

// A Date whose UTC y/m/d equals the requested Addis-local calendar day —
// matches how Deposit.date and every date-range filter elsewhere in the app
// bucket "a day" (UTC midnight boundaries), just anchored to Addis's wall
// clock instead of the server's.
export function resolveReportDate(reportFor: $Enums.TelegramReportFor, now: Date = new Date()): Date {
  const base = reportFor === "YESTERDAY" ? new Date(now.getTime() - 24 * 60 * 60 * 1000) : now;
  const { year, month, day } = addisDateParts(base);
  return new Date(Date.UTC(year, month - 1, day));
}

function dayRange(date: Date): { from: Date; to: Date } {
  const from = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const to = new Date(from.getTime() + 24 * 60 * 60 * 1000);
  return { from, to };
}

export function fmtDateLabel(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(date);
}

export function fmtETB(n: number): string {
  return new Intl.NumberFormat("en-ET", { maximumFractionDigits: 2 }).format(n) + " ETB";
}

// The company's own 16 OTA-registered departure terminals — the canonical
// "all routes" list every report backfills against, so a terminal with zero
// activity in a given period still shows up (at zero) instead of silently
// vanishing from the report the way a plain groupBy-over-SalesTrip would.
export async function getCanonicalDepartureTerminals(): Promise<string[]> {
  const rows = await prisma.otaCompanyRoute.findMany({
    select: { departureTerminalName: true },
    distinct: ["departureTerminalId"],
    orderBy: { departureTerminalName: "asc" },
  });
  return rows.map((r) => r.departureTerminalName);
}

// Every registered destination name across all 16 terminals — the same
// canonicalization target for arrival/route names as getCanonicalDeparture
// Terminals is for departures.
export async function getCanonicalArrivalTerminals(): Promise<string[]> {
  const rows = await prisma.otaCompanyRoute.findMany({
    select: { arrivalTerminalName: true },
    distinct: ["arrivalTerminalId"],
  });
  return rows.map((r) => r.arrivalTerminalName);
}

function normalizeName(s: string): string {
  return s.toLowerCase().replace(/\s+/g, "");
}

// sales_trips is synced from a different OTA endpoint than OtaCompanyRoute's
// route registry, and the two have drifted in spelling before (casing,
// stray whitespace) for the same physical terminal — without this, a report
// that keys its per-station buckets by exact string equality would split
// one terminal's real activity into two near-identical entries (the
// canonical one backfilled at zero, the real numbers stranded under the
// other spelling), which is exactly the "shows zero but there is sales" bug
// this resolves. Only folds case/whitespace variants together — a name with
// no normalized match falls through unchanged rather than being fuzzy-
// matched to the nearest canonical name, so two genuinely different
// terminals never get silently merged.
export function buildNameResolver(canonicalNames: string[]): (raw: string) => string {
  const byNorm = new Map(canonicalNames.map((n) => [normalizeName(n), n]));
  return (raw: string) => byNorm.get(normalizeName(raw)) ?? raw;
}

// Telegram's sendMessage caps text at 4096 characters. A per-station or
// per-mismatch list is normally nowhere near that, but nothing stops it from
// growing (more stations added, an unusually bad day for deposits) — this
// keeps whatever fits and says how many were left out instead of letting the
// whole send fail once the list crosses the limit.
const TELEGRAM_TEXT_LIMIT = 4096;

function capLines(usedChars: number, itemLines: string[], overflowNote: (remaining: number) => string): string[] {
  let used = usedChars;
  const kept: string[] = [];
  for (const line of itemLines) {
    const cost = line.length + 1;
    if (used + cost > TELEGRAM_TEXT_LIMIT - 200) break; // headroom for the overflow note itself
    kept.push(line);
    used += cost;
  }
  const remaining = itemLines.length - kept.length;
  if (remaining > 0) kept.push(overflowNote(remaining));
  return kept;
}

export async function buildDailySalesReport(date: Date): Promise<string> {
  const { from, to } = dayRange(date);
  const label = fmtDateLabel(date);

  const [aggregate, byTerminal, canonicalTerminals, syncNote] = await Promise.all([
    prisma.salesTrip.aggregate({
      where: { date: { gte: from, lt: to } },
      _sum: { totalServiceCharge: true, passengers: true },
      _count: { _all: true },
    }),
    prisma.salesTrip.groupBy({
      by: ["departureTerminalName"],
      where: { date: { gte: from, lt: to } },
      _sum: { totalServiceCharge: true },
    }),
    getCanonicalDepartureTerminals(),
    buildSyncFreshnessNote(to),
  ]);

  const totalRevenue = toNumber(aggregate._sum.totalServiceCharge ?? 0);
  const totalPassengers = aggregate._sum.passengers ?? 0;
  const totalTrips = aggregate._count._all;

  // Every one of the 16 departure terminals always appears, at zero if it
  // had no activity — instead of silently dropping out of the list. Raw
  // names are resolved to their canonical spelling first (summed rather
  // than overwritten, in case two spelling variants both matched one
  // terminal) so a sync-spelling drift folds into the right terminal
  // instead of appearing as a separate, seemingly-zero entry.
  const resolveDeparture = buildNameResolver(canonicalTerminals);
  const amountByStation = new Map<string, number>();
  for (const t of byTerminal) {
    const name = resolveDeparture(t.departureTerminalName);
    amountByStation.set(name, (amountByStation.get(name) ?? 0) + toNumber(t._sum.totalServiceCharge ?? 0));
  }
  for (const name of canonicalTerminals) {
    if (!amountByStation.has(name)) amountByStation.set(name, 0);
  }

  const header = [
    syncNote + `<b>Daily Sales Summary — ${label}</b>`,
    ``,
    `Trips: <b>${totalTrips.toLocaleString()}</b>`,
    `Passengers: <b>${totalPassengers.toLocaleString()}</b>`,
    `Total revenue: <b>${fmtETB(totalRevenue)}</b>`,
    ``,
    `By departure station (${amountByStation.size}):`,
  ];
  const sortedStations = [...amountByStation.entries()].sort((a, b) => b[1] - a[1]);
  const stationLines = sortedStations.map(([name, amount], i) => `${i + 1}. ${name} — ${fmtETB(amount)}`);
  const shown = capLines(
    header.join("\n").length,
    stationLines,
    (n) => `…and ${n} more station${n === 1 ? "" : "s"} — see the Sales page for full detail.`
  );

  return [...header, ...shown].join("\n");
}

export async function buildDailyDepositsReport(date: Date): Promise<string> {
  const { from, to } = dayRange(date);
  const label = fmtDateLabel(date);

  const [statusCounts, sums, mismatches] = await Promise.all([
    prisma.deposit.groupBy({ by: ["status"], where: { date: { gte: from, lt: to } }, _count: { _all: true } }),
    prisma.deposit.aggregate({ where: { date: { gte: from, lt: to } }, _sum: { expectedAmount: true, verifiedAmount: true } }),
    // Every mismatched or failed deposit that day — no cap, per the same
    // reasoning as the station list above.
    prisma.deposit.findMany({
      where: { date: { gte: from, lt: to }, status: { in: ["VERIFIED_MISMATCH", "FAILED"] } },
      include: { terminal: { select: { name: true } }, employee: { select: { firstName: true, lastName: true } } },
    }),
  ]);

  const byStatus = Object.fromEntries(statusCounts.map((s) => [s.status, s._count._all]));
  const totalExpected = toNumber(sums._sum.expectedAmount ?? 0);
  const totalVerified = toNumber(sums._sum.verifiedAmount ?? 0);

  const lines = [
    `<b>Daily Deposits Summary — ${label}</b>`,
    ``,
    `Expected: <b>${fmtETB(totalExpected)}</b>`,
    `Verified: <b>${fmtETB(totalVerified)}</b>`,
    `Matched: ${byStatus.VERIFIED_OK ?? 0} · Mismatched: ${byStatus.VERIFIED_MISMATCH ?? 0} · Failed: ${byStatus.FAILED ?? 0} · Still verifying: ${byStatus.SUBMITTED ?? 0} · Not submitted: ${byStatus.AWAITING_SUBMISSION ?? 0}`,
  ];

  if (mismatches.length > 0) {
    const mismatchLines = mismatches.map((d) => {
      const who = d.employee ? `${d.employee.firstName} ${d.employee.lastName}` : "Unknown cashier";
      const diff = d.discrepancyAmount !== null ? ` (${toNumber(d.discrepancyAmount) > 0 ? "+" : ""}${fmtETB(toNumber(d.discrepancyAmount))})` : "";
      return `• ${d.terminal?.name ?? "Unknown terminal"} — ${who}${diff}`;
    });
    lines.push(``, `Needs attention (${mismatches.length}):`);
    const shown = capLines(
      lines.join("\n").length,
      mismatchLines,
      (n) => `…and ${n} more — see the Deposits page for full list.`
    );
    lines.push(...shown);
  }

  return lines.join("\n");
}

function fmtAddisTime(instant: Date): string {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: ADDIS_TZ }).format(instant);
}

// station -> route (arrival terminal) -> revenue/service-charge, with the
// ticketer(s) who worked that route nested underneath — the shape the daily
// financial report walks to render its per-station blocks (and what the PDF
// attachment renders too, so the text message and the file always agree).
export type RouteTicketer = { name: string; revenue: number; serviceCharge: number };
export type RouteBucket = { revenue: number; serviceCharge: number; ticketers: Map<string, RouteTicketer> };
export type StationBucket = { routes: Map<string, RouteBucket>; revenue: number; serviceCharge: number };

function emptyStationBucket(): StationBucket {
  return { routes: new Map(), revenue: 0, serviceCharge: 0 };
}

// Adds `route`'s figures into `target` under `arrival`, summing rather than
// overwriting when the arrival already exists — used when merging several
// departureTerminalName spellings that all resolve to the same Station.
function mergeRouteInto(target: StationBucket, arrival: string, route: RouteBucket) {
  const existing = target.routes.get(arrival);
  if (!existing) {
    target.routes.set(arrival, { revenue: route.revenue, serviceCharge: route.serviceCharge, ticketers: new Map(route.ticketers) });
    return;
  }
  existing.revenue += route.revenue;
  existing.serviceCharge += route.serviceCharge;
  for (const [key, t] of route.ticketers) {
    const et = existing.ticketers.get(key);
    if (et) {
      et.revenue += t.revenue;
      et.serviceCharge += t.serviceCharge;
    } else {
      existing.ticketers.set(key, { ...t });
    }
  }
}

// Folds every departureTerminalName that matches one Station (there can be
// more than one spelling in the raw sales_trips data) into a single bucket
// for that station — used by the station-scoped text report and PDF so a
// scoped recipient sees one clean total, not one block per spelling.
// Looked up by normalized name (not exact key), since `names` comes from
// getStationMatchNames' own raw sales_trips spellings while `stations` is
// keyed by buildServiceChargeData's canonical spellings — an exact-match
// lookup would silently return nothing for a scoped recipient the moment
// those two diverge by so much as casing.
export function mergeStationBuckets(names: string[], stations: Map<string, StationBucket>): StationBucket {
  const merged = emptyStationBucket();
  const byNorm = new Map([...stations.entries()].map(([key, bucket]) => [normalizeName(key), bucket] as const));
  for (const name of names) {
    const s = stations.get(name) ?? byNorm.get(normalizeName(name));
    if (!s) continue;
    merged.revenue += s.revenue;
    merged.serviceCharge += s.serviceCharge;
    for (const [arrival, route] of s.routes) mergeRouteInto(merged, arrival, route);
  }
  return merged;
}

// "Last successful sync was HH:MM" (or a staleness/incompleteness warning)
// — shared by every report. Deliberately doesn't force a sync itself (that
// can take ~14 minutes and this report is built inside runDueSchedules,
// which the polling cron expects to answer in seconds — forcing a sync in
// here would just recreate the exact curl-times-out-on-a-slow-response
// problem already hit and fixed for the sales-sync cron).
//
// `periodEnd`, when given, is checked against the sync's own data window
// (windowTo) rather than just how many minutes old the sync is — a sync
// that finished 5 minutes ago can still have walked OTA's table *before*
// the reported day's last trips were entered on their side (confirmed
// live: a "yesterday" report sent at 8:21am was short 58 trips that only
// synced in at 8:42am). Minutes-since-last-sync can't see that gap; only
// comparing windowTo to the period being reported can.
async function buildSyncFreshnessNote(periodEnd?: Date): Promise<string> {
  const lastSync = await prisma.salesSyncLog.findFirst({
    // finishedAt is nullable (a run that's still in progress, or — rarely —
    // one whose final update never landed) and Postgres sorts NULLs first
    // on a DESC order by default, so without this filter a never-finalized
    // row would masquerade as "the most recent sync" ahead of every real one.
    where: { status: "SUCCESS", finishedAt: { not: null } },
    orderBy: { finishedAt: "desc" },
    select: { finishedAt: true, windowTo: true },
  });
  if (!lastSync?.finishedAt) return `⚠️ No completed sync on record — these numbers may be incomplete.\n\n`;

  if (periodEnd && lastSync.windowTo < periodEnd) {
    return `⚠️ Last sync only covered data up to ${fmtAddisTime(lastSync.windowTo)} — before this period closed, so these numbers are still incomplete and will grow on the next sync.\n\n`;
  }

  const syncAgeMin = Math.round((Date.now() - lastSync.finishedAt.getTime()) / 60000);
  if (syncAgeMin > 90) {
    return `⚠️ Last successful sync was ${fmtAddisTime(lastSync.finishedAt)} (${Math.floor(syncAgeMin / 60)}h ${syncAgeMin % 60}m ago) — numbers might not be fully caught up.\n\n`;
  }
  return `✅ Synced as of ${fmtAddisTime(lastSync.finishedAt)} Addis time.\n\n`;
}

function renderStationBlock(stationName: string, station: StationBucket): string {
  const total = station.revenue + station.serviceCharge;
  const lines = [`🏢 <b>${stationName}</b> — Rev: ${fmtETB(station.revenue)} · Svc: ${fmtETB(station.serviceCharge)} · Total: ${fmtETB(total)}`];

  if (station.routes.size === 0) {
    lines.push(`   <i>No activity today.</i>`);
    return lines.join("\n");
  }

  const sortedRoutes = [...station.routes.entries()].sort((a, b) => (b[1].revenue + b[1].serviceCharge) - (a[1].revenue + a[1].serviceCharge));
  for (const [arrival, route] of sortedRoutes) {
    const routeTotal = route.revenue + route.serviceCharge;
    lines.push(`  → <b>${arrival}</b> — Rev: ${fmtETB(route.revenue)} · Svc: ${fmtETB(route.serviceCharge)} · Total: ${fmtETB(routeTotal)}`);
    const sortedTicketers = [...route.ticketers.values()].sort((a, b) => (b.revenue + b.serviceCharge) - (a.revenue + a.serviceCharge));
    const workedBy = sortedTicketers.map((t) => `${t.name} (${fmtETB(t.revenue + t.serviceCharge)})`).join(", ");
    lines.push(`      Worked by: ${workedBy}`);
  }
  return lines.join("\n");
}

// Packs pre-rendered blocks into as many messages as needed to stay under
// Telegram's 4096-char cap — never truncating/dropping data (every figure in
// a reconciliation report has to actually show up somewhere), just spreading
// it across more messages instead. `finalBlock` (a totals line) is kept
// attached to the last block wherever it fits, otherwise sent as its own
// trailing message.
function packIntoMessages(prefix: string, blocks: string[], finalBlock: string): string[] {
  const messages: string[] = [];
  let current = prefix;
  for (const block of blocks) {
    const candidate = current + "\n\n" + block;
    if (candidate.length > TELEGRAM_TEXT_LIMIT - 100) {
      messages.push(current);
      current = block;
    } else {
      current = candidate;
    }
  }
  const withFinal = current + "\n\n" + finalBlock;
  if (withFinal.length > TELEGRAM_TEXT_LIMIT - 100) {
    messages.push(current);
    messages.push(finalBlock);
  } else {
    messages.push(withFinal);
  }
  return messages.length > 1 ? messages.map((m, i) => `${m}\n\n(${i + 1}/${messages.length})`) : messages;
}

// Core data fetch shared by the full daily financial report (text + PDF)
// and the single-station variant — one query, station -> route -> ticketer,
// pre-seeded with all 16 canonical departure terminals (at zero) so a
// terminal with no activity that day still shows up instead of vanishing.
export async function buildServiceChargeData(
  date: Date
): Promise<{ stations: Map<string, StationBucket>; grandRevenue: number; grandServiceCharge: number }> {
  const { from, to } = dayRange(date);

  const [rows, canonicalTerminals, canonicalArrivals] = await Promise.all([
    prisma.salesTrip.groupBy({
      by: ["departureTerminalName", "arrivalTerminalName", "employeeExternalId", "employeeName"],
      where: { date: { gte: from, lt: to }, employeeExternalId: { not: null } },
      _sum: { tariff: true, totalServiceCharge: true },
    }),
    getCanonicalDepartureTerminals(),
    getCanonicalArrivalTerminals(),
  ]);

  // Both sides resolved to their canonical (OTA route registry) spelling
  // before bucketing, so a departure or arrival name that's drifted in the
  // sales sync (casing, stray whitespace) folds into the same station/route
  // it really belongs to instead of splitting into a second, near-identical
  // entry that looks like missing/zero activity.
  const resolveDeparture = buildNameResolver(canonicalTerminals);
  const resolveArrival = buildNameResolver(canonicalArrivals);

  const stations = new Map<string, StationBucket>();
  for (const name of canonicalTerminals) stations.set(name, emptyStationBucket());

  let grandRevenue = 0;
  let grandServiceCharge = 0;

  for (const r of rows) {
    const revenue = toNumber(r._sum.tariff ?? 0);
    const serviceCharge = toNumber(r._sum.totalServiceCharge ?? 0);
    if (revenue === 0 && serviceCharge === 0) continue;

    const departureName = resolveDeparture(r.departureTerminalName);
    const arrivalName = resolveArrival(r.arrivalTerminalName);

    const station = stations.get(departureName) ?? emptyStationBucket();
    const route = station.routes.get(arrivalName) ?? { revenue: 0, serviceCharge: 0, ticketers: new Map<string, RouteTicketer>() };
    const ticketerKey = r.employeeExternalId as string;
    const ticketer = route.ticketers.get(ticketerKey) ?? { name: r.employeeName ?? "Unknown", revenue: 0, serviceCharge: 0 };

    ticketer.revenue += revenue;
    ticketer.serviceCharge += serviceCharge;
    route.ticketers.set(ticketerKey, ticketer);
    route.revenue += revenue;
    route.serviceCharge += serviceCharge;
    station.routes.set(arrivalName, route);
    station.revenue += revenue;
    station.serviceCharge += serviceCharge;
    stations.set(departureName, station);

    grandRevenue += revenue;
    grandServiceCharge += serviceCharge;
  }

  return { stations, grandRevenue, grandServiceCharge };
}

export function sortStationEntries(entries: [string, StationBucket][]): [string, StationBucket][] {
  return [...entries].sort((a, b) => {
    const totalA = a[1].revenue + a[1].serviceCharge;
    const totalB = b[1].revenue + b[1].serviceCharge;
    if (totalA === 0 && totalB === 0) return a[0].localeCompare(b[0]);
    if (totalA === 0) return 1;
    if (totalB === 0) return -1;
    return totalB - totalA;
  });
}

// Sent nightly (intended for 22:00 Addis time) as the full financial +
// operational close-out for the day — every one of the 16 departure
// terminals, each broken down route -> ticketer, with revenue and service
// charge shown side by side and a grand total at the end. Terminals with no
// activity still appear (via buildServiceChargeData's canonical backfill)
// instead of silently dropping out of the report.
export async function buildServiceChargeBreakdownReport(date: Date): Promise<string[]> {
  const label = fmtDateLabel(date);
  const syncNote = await buildSyncFreshnessNote(dayRange(date).to);
  const titleLine = `<b>Daily Financial Report — ${label}</b>`;

  const { stations, grandRevenue, grandServiceCharge } = await buildServiceChargeData(date);
  const grandTotal = grandRevenue + grandServiceCharge;

  const sortedStations = sortStationEntries([...stations.entries()]);
  const stationBlocks = sortedStations.map(([stationName, station]) => renderStationBlock(stationName, station));
  const grandTotalBlock = `<b>Grand total — ${label}: Revenue ${fmtETB(grandRevenue)} · Service charge ${fmtETB(grandServiceCharge)} · Total ${fmtETB(grandTotal)}</b>`;

  return packIntoMessages(syncNote + titleLine, stationBlocks, grandTotalBlock);
}

// Same report, scoped to one station's own departureTerminalName-matched
// trips — for a recipient (e.g. a station cashier) who should only ever see
// their own station's numbers, never anyone else's.
export async function buildStationServiceChargeReport(date: Date, stationId: string, stationName: string): Promise<string[]> {
  const label = fmtDateLabel(date);
  const syncNote = await buildSyncFreshnessNote(dayRange(date).to);
  const titleLine = `<b>${stationName} — Daily Financial Report — ${label}</b>`;

  const matchNames = await getStationMatchNames(stationId);
  const { stations } = await buildServiceChargeData(date);
  const merged = mergeStationBuckets(matchNames, stations);

  const total = merged.revenue + merged.serviceCharge;
  const totalBlock = `<b>Total for ${stationName} — ${label}: Revenue ${fmtETB(merged.revenue)} · Service charge ${fmtETB(merged.serviceCharge)} · Total ${fmtETB(total)}</b>`;
  return packIntoMessages(syncNote + titleLine, [renderStationBlock(stationName, merged)], totalBlock);
}

// The Gregorian [from, to) range for the Ethiopian-calendar month just
// before `now`'s Ethiopian month — the Ethiopian months run 30 days each
// except Pagume (5, or 6 in an Ethiopian leap year), so this resolves the
// *actual* previous-month boundaries rather than assuming a fixed length.
// Shared by the monthly report's text and its Excel attachment so both
// always agree on exactly the same period.
export function resolvePreviousEthiopianMonthRange(now: Date = new Date()): { from: Date; to: Date; label: string; gregorianRange: string } {
  const today = dateToEthiopian(now);
  const prevMonth = today.month === 1 ? 13 : today.month - 1;
  const prevYear = today.month === 1 ? today.year - 1 : today.year;

  const fromG = ethiopianToGregorian(prevYear, prevMonth, 1);
  const toG = ethiopianToGregorian(today.year, today.month, 1); // exclusive — this Ethiopian month's own day 1
  const from = new Date(Date.UTC(fromG.year, fromG.month - 1, fromG.day));
  const to = new Date(Date.UTC(toG.year, toG.month - 1, toG.day));

  const label = `${ETHIOPIAN_MONTH_NAMES[prevMonth - 1]} ${prevYear}`;
  const gregorianRange = `${fmtDateLabel(from)} – ${fmtDateLabel(new Date(to.getTime() - 86400000))}`;
  return { from, to, label, gregorianRange };
}

// Fires on the 1st of every Ethiopian-calendar month (see isScheduleDueToday's
// ETHIOPIAN_MONTHLY case) and closes out the month that just ended. Revenue
// (tariff) and service charge are reported as two separate figures, unlike
// the daily sales report, whose "Total revenue" line is actually the
// service-charge sum alone — this one shows both correctly.
export async function buildMonthlySalesReport(now: Date = new Date()): Promise<string[]> {
  const { from, to, label, gregorianRange } = resolvePreviousEthiopianMonthRange(now);
  const syncNote = await buildSyncFreshnessNote(to);
  const titleLine = `<b>Monthly Sales Summary — ${label}</b>\n<i>${gregorianRange}</i>`;

  const [aggregate, byStation, canonicalTerminals] = await Promise.all([
    prisma.salesTrip.aggregate({
      where: { date: { gte: from, lt: to } },
      _sum: { tariff: true, totalServiceCharge: true, passengers: true },
      _count: { _all: true },
    }),
    prisma.salesTrip.groupBy({
      by: ["departureTerminalName"],
      where: { date: { gte: from, lt: to } },
      _sum: { tariff: true, totalServiceCharge: true, passengers: true },
      _count: { _all: true },
    }),
    getCanonicalDepartureTerminals(),
  ]);

  if (aggregate._count._all === 0) {
    return [`${syncNote}${titleLine}\n\nNo trips recorded for this month.`];
  }

  const totalRevenue = toNumber(aggregate._sum.tariff ?? 0);
  const totalServiceCharge = toNumber(aggregate._sum.totalServiceCharge ?? 0);
  const totalCollected = totalRevenue + totalServiceCharge;

  // Every one of the 16 departure terminals always appears, even with zero
  // trips this month, instead of dropping out of the by-station list. Raw
  // names are resolved to their canonical spelling first (summed, not
  // overwritten) for the same reason as the daily report — a sync-spelling
  // drift must fold into the right terminal, not look like a second one.
  const resolveDeparture = buildNameResolver(canonicalTerminals);
  const statMap = new Map<string, { name: string; trips: number; revenue: number; svc: number }>();
  for (const s of byStation) {
    const name = resolveDeparture(s.departureTerminalName);
    const existing = statMap.get(name) ?? { name, trips: 0, revenue: 0, svc: 0 };
    existing.trips += s._count._all;
    existing.revenue += toNumber(s._sum.tariff ?? 0);
    existing.svc += toNumber(s._sum.totalServiceCharge ?? 0);
    statMap.set(name, existing);
  }
  for (const name of canonicalTerminals) {
    if (!statMap.has(name)) statMap.set(name, { name, trips: 0, revenue: 0, svc: 0 });
  }

  const header = [
    syncNote + titleLine,
    ``,
    `Trips: <b>${aggregate._count._all.toLocaleString()}</b>`,
    `Passengers: <b>${(aggregate._sum.passengers ?? 0).toLocaleString()}</b>`,
    `Revenue: <b>${fmtETB(totalRevenue)}</b>`,
    `Service charge: <b>${fmtETB(totalServiceCharge)}</b>`,
    `Total collected: <b>${fmtETB(totalCollected)}</b>`,
    ``,
    `By station (${statMap.size}):`,
  ].join("\n");

  const sortedStations = [...statMap.values()].sort((a, b) => {
    const totalA = a.revenue + a.svc;
    const totalB = b.revenue + b.svc;
    if (totalA === 0 && totalB === 0) return a.name.localeCompare(b.name);
    if (totalA === 0) return 1;
    if (totalB === 0) return -1;
    return totalB - totalA;
  });

  const stationBlocks = sortedStations.map((s) =>
    s.trips > 0
      ? `🏢 <b>${s.name}</b> — ${s.trips.toLocaleString()} trips\n   Revenue: ${fmtETB(s.revenue)} · Service charge: ${fmtETB(s.svc)} · Total: ${fmtETB(s.revenue + s.svc)}`
      : `🏢 <b>${s.name}</b> — <i>No activity this month.</i>`
  );

  const grandTotalBlock = `<b>Grand total — ${label}: ${fmtETB(totalCollected)}</b>`;
  return packIntoMessages(header, stationBlocks, grandTotalBlock);
}

export function renderCustomTemplate(template: string, date: Date): string {
  return template.replace(/\{\{\s*date\s*\}\}/gi, fmtDateLabel(date));
}
