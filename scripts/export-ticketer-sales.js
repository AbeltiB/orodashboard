// scripts/export-ticketer-sales.js
// One-off export: for every station with sales activity in the date range,
// writes an .xlsx file with one sheet per ticketer who worked there —
// each sheet listing day x route revenue/service-charge, that day's totals,
// and a grand total row for the whole period. Run with: node scripts/export-ticketer-sales.js
require("dotenv").config();
const { Pool } = require("pg");
const ExcelJS = require("exceljs");
const fs = require("fs");
const path = require("path");

const DATE_FROM = "2026-07-08"; // Hamle 1, 2018 E.C.
const DATE_TO = "2026-08-14"; // yesterday, inclusive
const OUT_DIR = path.join(__dirname, "..", "exports", "ticketer-sales");

function normalizeName(s) {
  return s.toLowerCase().replace(/\s+/g, "");
}

function sanitizeSheetName(name, usedNames) {
  let base = name.replace(/[\\/?*[\]:]/g, " ").trim().slice(0, 31) || "Unknown";
  let candidate = base;
  let n = 2;
  while (usedNames.has(candidate.toLowerCase())) {
    const suffix = ` (${n})`;
    candidate = base.slice(0, 31 - suffix.length) + suffix;
    n++;
  }
  usedNames.add(candidate.toLowerCase());
  return candidate;
}

function sanitizeFileName(name) {
  return name.replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim();
}

function styleHeaderRow(row) {
  row.font = { bold: true };
  row.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } };
  });
}

function fmtDayLabel(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(d);
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  console.log(`Exporting ticketer sales: ${DATE_FROM} through ${DATE_TO} (inclusive)`);
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // 1. All active stations.
  const stationsRes = await pool.query(
    `SELECT id, code, name FROM stations WHERE "isDeleted" = false ORDER BY name ASC`
  );
  const stations = stationsRes.rows;

  // 2. Distinct departure names actually on file, to resolve against station
  //    names (case/whitespace-normalized) — same approach as the cashier
  //    portal's station scoping, just without any per-cashier restriction.
  const distinctDepartures = await pool.query(
    `SELECT DISTINCT "departureTerminalName" FROM sales_trips WHERE "departureTerminalName" IS NOT NULL`
  );
  const departureNames = distinctDepartures.rows.map((r) => r.departureTerminalName);

  // 3. Terminal -> linked-station name overrides, same as getCashierStationMatchNames.
  const terminalsRes = await pool.query(`
    SELECT t."stationId", t.name, t."isLinkedStation", ls.name as "linkedStationName"
    FROM terminals t
    LEFT JOIN stations ls ON ls.id = t."linkedStationId"
    WHERE t."isDeleted" = false
  `);
  const terminalNamesByStation = new Map();
  for (const t of terminalsRes.rows) {
    const name = t.isLinkedStation && t.linkedStationName ? t.linkedStationName : t.name;
    if (!terminalNamesByStation.has(t.stationId)) terminalNamesByStation.set(t.stationId, new Set());
    terminalNamesByStation.get(t.stationId).add(normalizeName(name));
  }

  let filesWritten = 0;
  let stationsSkipped = 0;

  for (const station of stations) {
    const candidateNames = new Set([normalizeName(station.name)]);
    for (const n of terminalNamesByStation.get(station.id) ?? []) candidateNames.add(n);

    const matchNames = departureNames.filter((name) => candidateNames.has(normalizeName(name)));
    if (matchNames.length === 0) {
      stationsSkipped++;
      continue;
    }

    const rowsRes = await pool.query(
      `
      SELECT
        "employeeExternalId" as emp_id,
        "employeeName" as emp_name,
        to_char(date_trunc('day', "date"), 'YYYY-MM-DD') as day,
        "arrivalTerminalName" as route,
        SUM("tariff")::float as tariff,
        SUM("totalServiceCharge")::float as svc
      FROM sales_trips
      WHERE "departureTerminalName" = ANY($1)
        AND "employeeExternalId" IS NOT NULL
        AND "date" >= $2::timestamp
        AND "date" < $3::timestamp + interval '1 day'
      GROUP BY emp_id, emp_name, day, route
      ORDER BY emp_name ASC, day ASC, route ASC
      `,
      [matchNames, DATE_FROM, DATE_TO]
    );

    if (rowsRes.rows.length === 0) {
      stationsSkipped++;
      continue;
    }

    // Group rows by ticketer, then by day within each ticketer.
    const byTicketer = new Map();
    for (const r of rowsRes.rows) {
      const key = r.emp_id;
      if (!byTicketer.has(key)) byTicketer.set(key, { name: r.emp_name || "Unknown", days: new Map(), grand: { tariff: 0, svc: 0 } });
      const t = byTicketer.get(key);
      const dayKey = r.day;
      if (!t.days.has(dayKey)) t.days.set(dayKey, { routes: [], dayTariff: 0, daySvc: 0 });
      const d = t.days.get(dayKey);
      d.routes.push({ route: r.route, tariff: r.tariff, svc: r.svc });
      d.dayTariff += r.tariff;
      d.daySvc += r.svc;
      t.grand.tariff += r.tariff;
      t.grand.svc += r.svc;
    }

    // Sort ticketers by grand total collected, descending — matches the
    // convention used elsewhere in the app's Excel exports.
    const ticketers = [...byTicketer.values()].sort(
      (a, b) => (b.grand.tariff + b.grand.svc) - (a.grand.tariff + a.grand.svc)
    );

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "OroDashboard";
    workbook.created = new Date();
    const usedSheetNames = new Set();

    for (const ticketer of ticketers) {
      const sheet = workbook.addWorksheet(sanitizeSheetName(ticketer.name, usedSheetNames));
      sheet.columns = [
        { header: "Date", key: "date", width: 18 },
        { header: "Route", key: "route", width: 24 },
        { header: "Route revenue (ETB)", key: "routeRevenue", width: 18 },
        { header: "Route service charge (ETB)", key: "routeSvc", width: 22 },
        { header: "Day total revenue (ETB)", key: "dayRevenue", width: 20 },
        { header: "Day total service charge (ETB)", key: "daySvc", width: 24 },
      ];
      styleHeaderRow(sheet.getRow(1));

      const sortedDays = [...ticketer.days.entries()].sort((a, b) => a[0].localeCompare(b[0]));
      for (const [dayKey, d] of sortedDays) {
        const sortedRoutes = [...d.routes].sort((a, b) => a.route.localeCompare(b.route));
        for (const r of sortedRoutes) {
          sheet.addRow({
            date: fmtDayLabel(dayKey),
            route: r.route,
            routeRevenue: Math.round(r.tariff * 100) / 100,
            routeSvc: Math.round(r.svc * 100) / 100,
            dayRevenue: Math.round(d.dayTariff * 100) / 100,
            daySvc: Math.round(d.daySvc * 100) / 100,
          });
        }
      }

      sheet.addRow([]);
      const grandRow = sheet.addRow({
        date: "GRAND TOTAL (whole period)",
        dayRevenue: Math.round(ticketer.grand.tariff * 100) / 100,
        daySvc: Math.round(ticketer.grand.svc * 100) / 100,
      });
      grandRow.font = { bold: true };
    }

    const filename = `${sanitizeFileName(station.code)} - ${sanitizeFileName(station.name)}.xlsx`;
    const filePath = path.join(OUT_DIR, filename);
    await workbook.xlsx.writeFile(filePath);
    filesWritten++;
    console.log(`Wrote ${filename} (${ticketers.length} ticketer sheet${ticketers.length === 1 ? "" : "s"})`);
  }

  console.log(`\nDone. ${filesWritten} station file(s) written to ${OUT_DIR}, ${stationsSkipped} station(s) skipped (no data in range).`);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
