// src/lib/telegram/workbook.ts
// Builds the detailed multi-sheet Excel attachment for a schedule with
// includeDetailedFile turned on — full row-level detail plus per-station/
// ticketer/route (sales) or per-terminal/cashier (deposits) rollups, so the
// short Telegram text recap can point to "see attached" for anyone who wants
// the whole picture instead of just the summary numbers.
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { toNumber } from "@/lib/api-utils";
import { resolvePreviousEthiopianMonthRange } from "./reports";
import type { $Enums } from "@/generated/prisma/client";

function dayRange(date: Date): { from: Date; to: Date } {
  const from = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const to = new Date(from.getTime() + 24 * 60 * 60 * 1000);
  return { from, to };
}

function fmtDateLabel(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(date);
}

function styleHeaderRow(row: ExcelJS.Row) {
  row.font = { bold: true };
  row.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } };
  });
}

function addTotalsRow(sheet: ExcelJS.Worksheet, values: (string | number)[]) {
  const row = sheet.addRow(values);
  row.font = { bold: true };
}

type Accumulator = {
  trips: number; passengers: number; distanceKm: number; tariff: number; totalServiceCharge: number;
};
function emptyAcc(): Accumulator {
  return { trips: 0, passengers: 0, distanceKm: 0, tariff: 0, totalServiceCharge: 0 };
}
function addToAcc(acc: Accumulator, t: { passengers: number; distanceKm: unknown; tariff: unknown; totalServiceCharge: unknown }) {
  acc.trips += 1;
  acc.passengers += t.passengers;
  acc.distanceKm += toNumber(t.distanceKm);
  acc.tariff += toNumber(t.tariff);
  acc.totalServiceCharge += toNumber(t.totalServiceCharge);
}

async function buildSalesWorkbook(from: Date, to: Date, title: string, periodLabel: string): Promise<ExcelJS.Workbook> {
  const trips = await prisma.salesTrip.findMany({
    where: { date: { gte: from, lt: to } },
    orderBy: { date: "asc" },
  });

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "OroDashboard";
  workbook.created = new Date();

  // ── Summary ──
  const grand = emptyAcc();
  for (const t of trips) addToAcc(grand, t);
  const summary = workbook.addWorksheet("Summary");
  summary.columns = [{ width: 28 }, { width: 20 }];
  summary.addRow([title, periodLabel]).font = { bold: true, size: 13 };
  summary.addRow([]);
  summary.addRow(["Total trips", grand.trips]);
  summary.addRow(["Total passengers", grand.passengers]);
  summary.addRow(["Total distance (km)", Math.round(grand.distanceKm * 100) / 100]);
  summary.addRow(["Tariff revenue (ETB)", Math.round(grand.tariff * 100) / 100]);
  summary.addRow(["Service charge collected (ETB)", Math.round(grand.totalServiceCharge * 100) / 100]);
  summary.addRow(["Total collected (ETB)", Math.round((grand.tariff + grand.totalServiceCharge) * 100) / 100]);

  // ── Trips (full detail) ──
  const tripsSheet = workbook.addWorksheet("Trips");
  tripsSheet.columns = [
    { header: "Date/time", key: "date", width: 20 },
    { header: "Departure", key: "departure", width: 18 },
    { header: "Arrival", key: "arrival", width: 18 },
    { header: "Ticketer", key: "ticketer", width: 22 },
    { header: "Vehicle plate", key: "plate", width: 14 },
    { header: "Company", key: "company", width: 26 },
    { header: "Association", key: "association", width: 20 },
    { header: "Fleet category", key: "fleet", width: 14 },
    { header: "Level", key: "level", width: 10 },
    { header: "Distance (km)", key: "distance", width: 13 },
    { header: "Passengers", key: "passengers", width: 11 },
    { header: "Tariff", key: "tariff", width: 12 },
    { header: "Service charge/pax", key: "svcPax", width: 15 },
    { header: "Service charge total", key: "svcTotal", width: 16 },
  ];
  styleHeaderRow(tripsSheet.getRow(1));
  for (const t of trips) {
    tripsSheet.addRow({
      date: t.date.toISOString().replace("T", " ").slice(0, 19),
      departure: t.departureTerminalName,
      arrival: t.arrivalTerminalName,
      ticketer: t.employeeName ?? "—",
      plate: t.vehiclePlateNo ?? "—",
      company: t.companyName,
      association: t.vehicleAssociation ?? "—",
      fleet: t.vehicleFleetCategory ?? "—",
      level: t.level,
      distance: toNumber(t.distanceKm),
      passengers: t.passengers,
      tariff: toNumber(t.tariff),
      svcPax: toNumber(t.serviceCharge),
      svcTotal: toNumber(t.totalServiceCharge),
    });
  }

  // ── Rollup helper — group `trips` by a key function into one sheet ──
  function addRollupSheet(name: string, keyOf: (t: (typeof trips)[number]) => string, headerLabel: string) {
    const sheet = workbook.addWorksheet(name);
    sheet.columns = [
      { header: headerLabel, key: "key", width: 28 },
      { header: "Trips", key: "trips", width: 10 },
      { header: "Passengers", key: "passengers", width: 12 },
      { header: "Distance (km)", key: "distance", width: 14 },
      { header: "Tariff", key: "tariff", width: 12 },
      { header: "Service charge", key: "svc", width: 14 },
      { header: "Total collected", key: "total", width: 15 },
    ];
    styleHeaderRow(sheet.getRow(1));

    const map = new Map<string, Accumulator>();
    for (const t of trips) {
      const key = keyOf(t);
      const acc = map.get(key) ?? emptyAcc();
      addToAcc(acc, t);
      map.set(key, acc);
    }
    const rows = [...map.entries()].sort((a, b) => (b[1].tariff + b[1].totalServiceCharge) - (a[1].tariff + a[1].totalServiceCharge));
    for (const [key, acc] of rows) {
      sheet.addRow({
        key,
        trips: acc.trips,
        passengers: acc.passengers,
        distance: Math.round(acc.distanceKm * 100) / 100,
        tariff: Math.round(acc.tariff * 100) / 100,
        svc: Math.round(acc.totalServiceCharge * 100) / 100,
        total: Math.round((acc.tariff + acc.totalServiceCharge) * 100) / 100,
      });
    }
    addTotalsRow(sheet, [
      "TOTAL", grand.trips, grand.passengers,
      Math.round(grand.distanceKm * 100) / 100, Math.round(grand.tariff * 100) / 100,
      Math.round(grand.totalServiceCharge * 100) / 100, Math.round((grand.tariff + grand.totalServiceCharge) * 100) / 100,
    ]);
  }

  addRollupSheet("By Station", (t) => t.departureTerminalName, "Departure station");
  addRollupSheet("By Ticketer", (t) => t.employeeName ?? "Unknown", "Ticketer");
  addRollupSheet("By Route", (t) => `${t.departureTerminalName} → ${t.arrivalTerminalName}`, "Route");

  return workbook;
}

async function buildDepositsWorkbook(date: Date): Promise<ExcelJS.Workbook> {
  const { from, to } = dayRange(date);
  const deposits = await prisma.deposit.findMany({
    where: { date: { gte: from, lt: to } },
    include: {
      employee: { select: { firstName: true, lastName: true } },
      terminal: { select: { name: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "OroDashboard";
  workbook.created = new Date();

  const totalExpected = deposits.reduce((s, d) => s + toNumber(d.expectedAmount), 0);
  const totalVerified = deposits.reduce((s, d) => s + (d.verifiedAmount !== null ? toNumber(d.verifiedAmount) : 0), 0);

  const summary = workbook.addWorksheet("Summary");
  summary.columns = [{ width: 28 }, { width: 20 }];
  summary.addRow(["Daily Deposits — full detail", fmtDateLabel(date)]).font = { bold: true, size: 13 };
  summary.addRow([]);
  summary.addRow(["Total deposits", deposits.length]);
  summary.addRow(["Total expected (ETB)", Math.round(totalExpected * 100) / 100]);
  summary.addRow(["Total verified (ETB)", Math.round(totalVerified * 100) / 100]);
  for (const status of ["AWAITING_SUBMISSION", "SUBMITTED", "VERIFIED_OK", "VERIFIED_MISMATCH", "FAILED", "RESOLVED"] as $Enums.DepositStatus[]) {
    summary.addRow([status, deposits.filter((d) => d.status === status).length]);
  }

  const depositsSheet = workbook.addWorksheet("Deposits");
  depositsSheet.columns = [
    { header: "Terminal", key: "terminal", width: 20 },
    { header: "Cashier", key: "cashier", width: 22 },
    { header: "Expected", key: "expected", width: 12 },
    { header: "Verified", key: "verified", width: 12 },
    { header: "Discrepancy", key: "discrepancy", width: 13 },
    { header: "Status", key: "status", width: 18 },
    { header: "Bank", key: "bank", width: 12 },
    { header: "Reference", key: "reference", width: 18 },
    { header: "Discrepancy reason", key: "reason", width: 30 },
  ];
  styleHeaderRow(depositsSheet.getRow(1));
  for (const d of deposits) {
    depositsSheet.addRow({
      terminal: d.terminal?.name ?? "—",
      cashier: d.employee ? `${d.employee.firstName} ${d.employee.lastName}` : "—",
      expected: toNumber(d.expectedAmount),
      verified: d.verifiedAmount !== null ? toNumber(d.verifiedAmount) : "—",
      discrepancy: d.discrepancyAmount !== null ? toNumber(d.discrepancyAmount) : "—",
      status: d.status,
      bank: d.bank ?? "—",
      reference: d.referenceNumber ?? "—",
      reason: d.discrepancyReason ?? "—",
    });
  }

  const byTerminal = workbook.addWorksheet("By Terminal");
  byTerminal.columns = [
    { header: "Terminal", key: "terminal", width: 22 },
    { header: "Deposits", key: "count", width: 11 },
    { header: "Expected", key: "expected", width: 13 },
    { header: "Verified", key: "verified", width: 13 },
    { header: "Mismatches", key: "mismatches", width: 12 },
  ];
  styleHeaderRow(byTerminal.getRow(1));
  const terminalMap = new Map<string, { count: number; expected: number; verified: number; mismatches: number }>();
  for (const d of deposits) {
    const key = d.terminal?.name ?? "Unknown";
    const acc = terminalMap.get(key) ?? { count: 0, expected: 0, verified: 0, mismatches: 0 };
    acc.count += 1;
    acc.expected += toNumber(d.expectedAmount);
    acc.verified += d.verifiedAmount !== null ? toNumber(d.verifiedAmount) : 0;
    if (d.status === "VERIFIED_MISMATCH" || d.status === "FAILED") acc.mismatches += 1;
    terminalMap.set(key, acc);
  }
  for (const [terminal, acc] of terminalMap.entries()) {
    byTerminal.addRow({
      terminal, count: acc.count,
      expected: Math.round(acc.expected * 100) / 100,
      verified: Math.round(acc.verified * 100) / 100,
      mismatches: acc.mismatches,
    });
  }

  return workbook;
}

export async function buildDetailedWorkbook(
  reportType: $Enums.TelegramReportType,
  date: Date
): Promise<{ buffer: Buffer; filename: string } | null> {
  const dateKey = date.toISOString().slice(0, 10);

  if (reportType === "DAILY_SALES_SUMMARY") {
    const { from, to } = dayRange(date);
    const workbook = await buildSalesWorkbook(from, to, "Daily Sales — full detail", fmtDateLabel(date));
    const arrayBuffer = await workbook.xlsx.writeBuffer();
    return { buffer: Buffer.from(arrayBuffer), filename: `sales-detail-${dateKey}.xlsx` };
  }

  if (reportType === "DAILY_DEPOSITS_SUMMARY") {
    const workbook = await buildDepositsWorkbook(date);
    const arrayBuffer = await workbook.xlsx.writeBuffer();
    return { buffer: Buffer.from(arrayBuffer), filename: `deposits-detail-${dateKey}.xlsx` };
  }

  if (reportType === "MONTHLY_SALES_SUMMARY") {
    // Ignores the passed `date` and resolves its own "previous Ethiopian
    // month" range, same as buildMonthlySalesReport's text — keeps the
    // attached file and the recap always describing the same period.
    const { from, to, label, gregorianRange } = resolvePreviousEthiopianMonthRange();
    const workbook = await buildSalesWorkbook(from, to, "Monthly Sales — full detail", `${label} (${gregorianRange})`);
    const arrayBuffer = await workbook.xlsx.writeBuffer();
    const fileLabel = label.replace(/\s+/g, "-");
    return { buffer: Buffer.from(arrayBuffer), filename: `sales-detail-${fileLabel}.xlsx` };
  }

  return null;
}
