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

export async function buildDailySalesReport(date: Date): Promise<string> {
  const { from, to } = dayRange(date);
  const label = fmtDateLabel(date);

  const [aggregate, byTerminal] = await Promise.all([
    prisma.salesTrip.aggregate({
      where: { date: { gte: from, lt: to } },
      _sum: { totalServiceCharge: true, passengers: true },
      _count: { _all: true },
    }),
    prisma.salesTrip.groupBy({
      by: ["departureTerminalName"],
      where: { date: { gte: from, lt: to } },
      _sum: { totalServiceCharge: true },
      orderBy: { _sum: { totalServiceCharge: "desc" } },
      take: 5,
    }),
  ]);

  const totalRevenue = toNumber(aggregate._sum.totalServiceCharge ?? 0);
  const totalPassengers = aggregate._sum.passengers ?? 0;
  const totalTrips = aggregate._count._all;

  if (totalTrips === 0) {
    return `<b>Daily Sales Summary — ${label}</b>\n\nNo trips recorded for this day.`;
  }

  const topLines = byTerminal
    .map((t, i) => `${i + 1}. ${t.departureTerminalName} — ${fmtETB(toNumber(t._sum.totalServiceCharge ?? 0))}`)
    .join("\n");

  return [
    `<b>Daily Sales Summary — ${label}</b>`,
    ``,
    `Trips: <b>${totalTrips.toLocaleString()}</b>`,
    `Passengers: <b>${totalPassengers.toLocaleString()}</b>`,
    `Total revenue: <b>${fmtETB(totalRevenue)}</b>`,
    ``,
    `Top departure terminals:`,
    topLines,
  ].join("\n");
}

export async function buildDailyDepositsReport(date: Date): Promise<string> {
  const { from, to } = dayRange(date);
  const label = fmtDateLabel(date);

  const [statusCounts, sums, mismatches] = await Promise.all([
    prisma.deposit.groupBy({ by: ["status"], where: { date: { gte: from, lt: to } }, _count: { _all: true } }),
    prisma.deposit.aggregate({ where: { date: { gte: from, lt: to } }, _sum: { expectedAmount: true, verifiedAmount: true } }),
    prisma.deposit.findMany({
      where: { date: { gte: from, lt: to }, status: { in: ["VERIFIED_MISMATCH", "FAILED"] } },
      include: { terminal: { select: { name: true } }, employee: { select: { firstName: true, lastName: true } } },
      take: 10,
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
    lines.push(``, `Needs attention:`);
    for (const d of mismatches) {
      const who = d.employee ? `${d.employee.firstName} ${d.employee.lastName}` : "Unknown cashier";
      const diff = d.discrepancyAmount !== null ? ` (${toNumber(d.discrepancyAmount) > 0 ? "+" : ""}${fmtETB(toNumber(d.discrepancyAmount))})` : "";
      lines.push(`• ${d.terminal?.name ?? "Unknown terminal"} — ${who}${diff}`);
    }
  }

  return lines.join("\n");
}

export function renderCustomTemplate(template: string, date: Date): string {
  return template.replace(/\{\{\s*date\s*\}\}/gi, fmtDateLabel(date));
}
