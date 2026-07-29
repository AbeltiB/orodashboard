// src/lib/telegram/reports.ts
// Builds the actual text content of each report type. All dates are
// resolved against Africa/Addis_Ababa wall-clock time (the business's one
// timezone, no DST) but bucketed as UTC-midnight days — the same convention
// already used by SalesTrip filtering and Deposit.date (see src/lib/deposits.ts)
// so a report's numbers always match what the Sales/Deposits pages show for
// that same calendar day.
import { prisma } from "@/lib/prisma";
import { toNumber } from "@/lib/api-utils";
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

function fmtDateLabel(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(date);
}

function fmtETB(n: number): string {
  return new Intl.NumberFormat("en-ET", { maximumFractionDigits: 2 }).format(n) + " ETB";
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

  const [aggregate, byTerminal] = await Promise.all([
    prisma.salesTrip.aggregate({
      where: { date: { gte: from, lt: to } },
      _sum: { totalServiceCharge: true, passengers: true },
      _count: { _all: true },
    }),
    // Every departure station that had trips this day — no cap, so this
    // always covers all of them (currently 9) and keeps covering all of
    // them automatically as more stations get added later.
    prisma.salesTrip.groupBy({
      by: ["departureTerminalName"],
      where: { date: { gte: from, lt: to } },
      _sum: { totalServiceCharge: true },
      orderBy: { _sum: { totalServiceCharge: "desc" } },
    }),
  ]);

  const totalRevenue = toNumber(aggregate._sum.totalServiceCharge ?? 0);
  const totalPassengers = aggregate._sum.passengers ?? 0;
  const totalTrips = aggregate._count._all;

  if (totalTrips === 0) {
    return `<b>Daily Sales Summary — ${label}</b>\n\nNo trips recorded for this day.`;
  }

  const header = [
    `<b>Daily Sales Summary — ${label}</b>`,
    ``,
    `Trips: <b>${totalTrips.toLocaleString()}</b>`,
    `Passengers: <b>${totalPassengers.toLocaleString()}</b>`,
    `Total revenue: <b>${fmtETB(totalRevenue)}</b>`,
    ``,
    `By departure station (${byTerminal.length}):`,
  ];
  const stationLines = byTerminal.map((t, i) => `${i + 1}. ${t.departureTerminalName} — ${fmtETB(toNumber(t._sum.totalServiceCharge ?? 0))}`);
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

export function renderCustomTemplate(template: string, date: Date): string {
  return template.replace(/\{\{\s*date\s*\}\}/gi, fmtDateLabel(date));
}
