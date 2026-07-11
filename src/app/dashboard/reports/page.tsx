"use client";

import { useState, useRef } from "react";
import {
  FileText, Download, Filter, ChevronDown, ChevronRight,
  MapPin, Users, Monitor, Wallet, Calculator,
  X, Check, FileSpreadsheet, Printer,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type ReportId =
  | "fare-summary"
  | "petty-cash-ledger"
  | "staff-roster"
  | "pos-fleet"
  | "station-summary";

// ─── Seed data (mirrors what lives in the other pages) ────────────────────────

const STATIONS = [
  { id: "STN-001", name: "Meskel Square Terminal", region: "Addis Ababa", zone: "Central", employeeCount: 2, posCount: 1, terminalCount: 2 },
  { id: "STN-002", name: "Bole Station",            region: "Addis Ababa", zone: "East",    employeeCount: 1, posCount: 0, terminalCount: 0 },
  { id: "STN-003", name: "Piassa Hub",              region: "Addis Ababa", zone: "North",   employeeCount: 0, posCount: 1, terminalCount: 0 },
];

const EMPLOYEES = [
  { id: "EMP-001", name: "Abebe Girma Tadesse",   role: "Supervisor", station: "Meskel Square Terminal", stationId: "STN-001", salary: 8500,  pos: "POS-AA-001", employmentDate: "2021-03-15", phone: "0911234567", sex: "Male" },
  { id: "EMP-002", name: "Tigist Haile Mekonen",  role: "Ticketer",   station: "Meskel Square Terminal", stationId: "STN-001", salary: 6200,  pos: "",           employmentDate: "2022-07-01", phone: "0922345678", sex: "Female" },
  { id: "EMP-003", name: "Dawit Tesfaye Bekele",  role: "Cashier",    station: "Bole Station",           stationId: "STN-002", salary: 6200,  pos: "POS-AA-003", employmentDate: "2023-01-20", phone: "0933456789", sex: "Male" },
  { id: "EMP-004", name: "Sara Kebede Alemu",     role: "Supervisor", station: "Piassa Hub",             stationId: "STN-003", salary: 9000,  pos: "",           employmentDate: "2020-11-05", phone: "0944567890", sex: "Female" },
];

const POS_MACHINES = [
  { id: "POS-001", serial: "VFN-240M-AA001", make: "Verifone",      model: "V240m",        status: "Active",      appVersion: "ORO Ticket v2.4.1", station: "Meskel Square Terminal", employee: "Abebe Girma Tadesse",  lastAssigned: "2024-03-01" },
  { id: "POS-002", serial: "PAX-A920-AA002", make: "PAX Technology",model: "A920",          status: "Active",      appVersion: "ORO Ticket v2.4.1", station: "Meskel Square Terminal", employee: "Tigist Haile Mekonen", lastAssigned: "2023-06-01" },
  { id: "POS-003", serial: "ING-MV5K-AA003", make: "Ingenico",      model: "Move 5000",    status: "Maintenance", appVersion: "ORO Ticket v2.3.8", station: "Bole Station",           employee: "",                    lastAssigned: "2022-11-01" },
  { id: "POS-004", serial: "VFN-240M-AA004", make: "Verifone",      model: "V240m",        status: "Idle",        appVersion: "ORO Ticket v2.2.5", station: "Piassa Hub",             employee: "",                    lastAssigned: "" },
];

const PETTY_CASH = [
  { id: "pc1", employeeId: "EMP-001", employee: "Abebe Girma Tadesse", station: "Meskel Square Terminal", amount: 2000, date: "2024-11-01", method: "Bank Transfer", reference: "TXN-001-2024", note: "Monthly ops float" },
  { id: "pc2", employeeId: "EMP-001", employee: "Abebe Girma Tadesse", station: "Meskel Square Terminal", amount: 1500, date: "2024-12-10", method: "Telebirr",      reference: "TLB-998877",   note: "" },
  { id: "pc3", employeeId: "EMP-004", employee: "Sara Kebede Alemu",   station: "Piassa Hub",             amount: 3000, date: "2024-11-20", method: "Cheque",        reference: "CHQ-00441",    note: "Q4 float" },
  { id: "pc4", employeeId: "EMP-004", employee: "Sara Kebede Alemu",   station: "Piassa Hub",             amount: 1200, date: "2025-01-05", method: "Bank Transfer", reference: "TXN-002-2025", note: "" },
];

const TERMINALS = [
  { stationId: "STN-001", stationName: "Meskel Square Terminal", terminalName: "Bole Station", distanceKm: 12.5, roadType: "Asphalt", asphaltKm: 12.5, gravelKm: 0,   isDeparture: true,  isArrival: false },
  { stationId: "STN-001", stationName: "Meskel Square Terminal", terminalName: "Hayat Stop",   distanceKm: 18.0, roadType: "Mixed",   asphaltKm: 11.0, gravelKm: 7.0,  isDeparture: false, isArrival: true  },
];

const FARE_MATRIX: Record<string, Record<string, { asphalt: number; gravel: number }>> = {
  Bus:     { "Level 1": { asphalt: 0.85, gravel: 1.10 }, "Level 2": { asphalt: 1.20, gravel: 1.55 }, "Level 3": { asphalt: 1.65, gravel: 2.05 } },
  Midbus:  { "Level 1": { asphalt: 1.05, gravel: 1.35 }, "Level 2": { asphalt: 1.45, gravel: 1.80 }, "Level 3": { asphalt: 1.90, gravel: 2.30 } },
  Minibus: { "Level 1": { asphalt: 1.30, gravel: 1.60 }, "Level 2": { asphalt: 1.75, gravel: 2.10 }, "Level 3": { asphalt: 2.20, gravel: 2.65 } },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtCurrency(n: number) {
  return n.toLocaleString("en-ET", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ETB";
}

function fmtDate(iso: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

// ─── Export helpers — client-side, no extra deps ──────────────────────────────

function exportCSV(filename: string, headers: string[], rows: (string | number)[][][]) {
  const allRows = rows.flat();
  const csv = [headers, ...allRows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = filename + ".csv"; a.click();
  URL.revokeObjectURL(url);
}

function exportHTML(filename: string, title: string, headers: string[], rows: (string | number)[][]) {
  const rowsHtml = rows.map(r =>
    `<tr>${r.map(c => `<td>${c}</td>`).join("")}</tr>`
  ).join("");
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
    <title>${title}</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 32px; color: #0f172a; }
      h1 { font-size: 20px; margin-bottom: 4px; }
      p.meta { font-size: 12px; color: #64748b; margin-bottom: 24px; }
      table { width: 100%; border-collapse: collapse; font-size: 13px; }
      th { background: #1d4ed8; color: #fff; padding: 10px 12px; text-align: left; font-weight: 600; }
      td { padding: 9px 12px; border-bottom: 1px solid #e2e8f0; }
      tr:nth-child(even) td { background: #f8fafc; }
      @media print { body { padding: 16px; } }
    </style>
  </head><body>
    <h1>${title}</h1>
    <p class="meta">OroDashboard · Generated ${new Date().toLocaleString("en-GB")} · Exported as PDF-ready HTML</p>
    <table>
      <thead><tr>${headers.map(h => `<th>${h}</th>`).join("")}</tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>
  </body></html>`;
  const blob = new Blob([html], { type: "text/html;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const w    = window.open(url, "_blank");
  if (w) setTimeout(() => w.print(), 600);
}

// ─── Shared UI ────────────────────────────────────────────────────────────────

const iCss: React.CSSProperties = {
  height: 36, padding: "0 11px",
  border: "1.5px solid var(--border)", borderRadius: 8,
  background: "var(--surface)", color: "var(--foreground)",
  fontSize: 13, outline: "none", cursor: "pointer",
};

function Select({ label, value, onChange, options }: {
  label: string; value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label style={{ fontSize: 11, fontWeight: 600, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</label>
      <select style={iCss} value={value} onChange={e => onChange(e.target.value)}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function DateInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label style={{ fontSize: 11, fontWeight: 600, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</label>
      <input type="date" style={iCss} value={value} onChange={e => onChange(e.target.value)} />
    </div>
  );
}

function ExportBar({ onCSV, onPDF }: { onCSV: () => void; onPDF: () => void }) {
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <button onClick={onCSV} style={{ height: 34, padding: "0 14px", borderRadius: 8, border: "1.5px solid var(--border)", background: "var(--surface)", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, color: "#16a34a" }}>
        <FileSpreadsheet size={14} /> Excel / CSV
      </button>
      <button onClick={onPDF} style={{ height: 34, padding: "0 14px", borderRadius: 8, border: "1.5px solid var(--border)", background: "var(--surface)", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, color: "#dc2626" }}>
        <Printer size={14} /> PDF / Print
      </button>
    </div>
  );
}

function Table({ headers, rows, emptyMsg = "No data matches the current filters." }: {
  headers: string[]; rows: (string | number)[][]; emptyMsg?: string;
}) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr>
            {headers.map(h => (
              <th key={h} style={{ padding: "10px 14px", textAlign: "left", background: "var(--background)", borderBottom: "2px solid var(--border)", fontSize: 11, fontWeight: 700, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0
            ? <tr><td colSpan={headers.length} style={{ padding: "32px 14px", textAlign: "center", color: "var(--muted-foreground)", fontStyle: "italic", fontSize: 13 }}>{emptyMsg}</td></tr>
            : rows.map((row, i) => (
              <tr key={i} style={{ background: i % 2 === 0 ? "var(--surface)" : "var(--background)" }}>
                {row.map((cell, j) => (
                  <td key={j} style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", color: "var(--foreground)", whiteSpace: "nowrap" }}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))
          }
        </tbody>
        {rows.length > 0 && (
          <tfoot>
            <tr>
              <td colSpan={headers.length} style={{ padding: "8px 14px", fontSize: 11, color: "var(--muted-foreground)", borderTop: "2px solid var(--border)" }}>
                {rows.length} record{rows.length !== 1 ? "s" : ""}
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

function SummaryChip({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div style={{ background: "var(--background)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 16px", borderLeft: `3px solid ${color}` }}>
      <div style={{ fontSize: 11, color: "var(--muted-foreground)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: "var(--foreground)", fontFamily: "monospace" }}>{value}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// REPORT 1 — Fare Summary
// ─────────────────────────────────────────────────────────────────────────────

function FareSummaryReport() {
  const [stationId, setStationId]   = useState("ALL");
  const [busType,   setBusType]     = useState("ALL");
  const [busLevel,  setBusLevel]    = useState("ALL");

  const busTypes  = ["Bus", "Midbus", "Minibus"];
  const busLevels = ["Level 1", "Level 2", "Level 3"];

  // Build rows: each terminal × each matching busType × each matching level
  const rows: (string | number)[][] = [];

  for (const t of TERMINALS) {
    if (stationId !== "ALL" && t.stationId !== stationId) continue;
    const types  = busType  !== "ALL" ? [busType]  : busTypes;
    const levels = busLevel !== "ALL" ? [busLevel] : busLevels;
    for (const bt of types) {
      for (const bl of levels) {
        const rates = FARE_MATRIX[bt]?.[bl];
        if (!rates) continue;
        const fare = rates.asphalt * t.asphaltKm + rates.gravel * t.gravelKm;
        rows.push([
          t.stationName,
          t.terminalName,
          `${t.distanceKm} km`,
          t.roadType,
          bt,
          bl,
          fmtCurrency(rates.asphalt),
          fmtCurrency(rates.gravel),
          fmtCurrency(fare),
        ]);
      }
    }
  }

  const headers = ["Station", "Terminal", "Distance", "Road Type", "Bus Type", "Level", "Asphalt Rate/km", "Gravel Rate/km", "Total Fare"];

  return (
    <div>
      {/* Filters */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        <Select label="Station" value={stationId} onChange={setStationId}
          options={[{ value: "ALL", label: "All stations" }, ...STATIONS.map(s => ({ value: s.id, label: s.name }))]} />
        <Select label="Bus type" value={busType} onChange={setBusType}
          options={[{ value: "ALL", label: "All types" }, ...busTypes.map(b => ({ value: b, label: b }))]} />
        <Select label="Bus level" value={busLevel} onChange={setBusLevel}
          options={[{ value: "ALL", label: "All levels" }, ...busLevels.map(l => ({ value: l, label: l }))]} />
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "flex-end" }}>
          <ExportBar
            onCSV={() => exportCSV("fare-summary", headers, [rows])}
            onPDF={() => exportHTML("fare-summary", "Fare Summary Report", headers, rows)}
          />
        </div>
      </div>

      {/* Summary chips */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 16 }}>
        <SummaryChip label="Routes" value={rows.length} color="#2563eb" />
        <SummaryChip label="Min fare" value={rows.length ? fmtCurrency(Math.min(...rows.map(r => parseFloat(String(r[8]).replace(" ETB","").replace(/,/g,""))))) : "—"} color="#16a34a" />
        <SummaryChip label="Max fare" value={rows.length ? fmtCurrency(Math.max(...rows.map(r => parseFloat(String(r[8]).replace(" ETB","").replace(/,/g,""))))) : "—"} color="#d97706" />
      </div>

      <Table headers={headers} rows={rows} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// REPORT 2 — Petty Cash Ledger
// ─────────────────────────────────────────────────────────────────────────────

function PettyCashLedger() {
  const [stationId,  setStationId]  = useState("ALL");
  const [employeeId, setEmployeeId] = useState("ALL");
  const [fromDate,   setFromDate]   = useState("");
  const [toDate,     setToDate]     = useState("");

  const supervisors = EMPLOYEES.filter(e => e.role === "Supervisor");

  const filtered = PETTY_CASH.filter(p => {
    if (stationId  !== "ALL" && EMPLOYEES.find(e => e.id === p.employeeId)?.stationId !== stationId) return false;
    if (employeeId !== "ALL" && p.employeeId !== employeeId) return false;
    if (fromDate && p.date < fromDate) return false;
    if (toDate   && p.date > toDate)   return false;
    return true;
  });

  const total = filtered.reduce((s, p) => s + p.amount, 0);
  const headers = ["Employee", "Station", "Amount (ETB)", "Date", "Method", "Reference", "Note"];
  const rows: (string | number)[][] = filtered.map(p => [
    p.employee, p.station,
    fmtCurrency(p.amount), fmtDate(p.date),
    p.method, p.reference, p.note || "—",
  ]);

  return (
    <div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        <Select label="Station" value={stationId} onChange={setStationId}
          options={[{ value: "ALL", label: "All stations" }, ...STATIONS.map(s => ({ value: s.id, label: s.name }))]} />
        <Select label="Supervisor" value={employeeId} onChange={setEmployeeId}
          options={[{ value: "ALL", label: "All supervisors" }, ...supervisors.map(e => ({ value: e.id, label: e.name }))]} />
        <DateInput label="From date" value={fromDate} onChange={setFromDate} />
        <DateInput label="To date"   value={toDate}   onChange={setToDate} />
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "flex-end" }}>
          <ExportBar
            onCSV={() => exportCSV("petty-cash-ledger", headers, [rows])}
            onPDF={() => exportHTML("petty-cash-ledger", "Petty Cash Ledger", headers, rows)}
          />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 16 }}>
        <SummaryChip label="Disbursements" value={filtered.length} color="#7c3aed" />
        <SummaryChip label="Total disbursed" value={fmtCurrency(total)} color="#dc2626" />
        <SummaryChip label="Avg per entry" value={filtered.length ? fmtCurrency(total / filtered.length) : "—"} color="#d97706" />
      </div>

      <Table headers={headers} rows={rows} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// REPORT 3 — Staff Roster
// ─────────────────────────────────────────────────────────────────────────────

function StaffRoster() {
  const [stationId, setStationId] = useState("ALL");
  const [role,      setRole]      = useState("ALL");
  const [sex,       setSex]       = useState("ALL");

  const filtered = EMPLOYEES.filter(e => {
    if (stationId !== "ALL" && e.stationId !== stationId) return false;
    if (role      !== "ALL" && e.role      !== role)      return false;
    if (sex       !== "ALL" && e.sex       !== sex)       return false;
    return true;
  });

  const totalSalary = filtered.reduce((s, e) => s + e.salary, 0);
  const headers = ["ID", "Full Name", "Role", "Station", "Phone", "Sex", "Employment Date", "Salary (ETB)", "POS Assigned"];
  const rows: (string | number)[][] = filtered.map(e => [
    e.id, e.name, e.role, e.station, e.phone, e.sex,
    fmtDate(e.employmentDate), fmtCurrency(e.salary), e.pos || "—",
  ]);

  return (
    <div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        <Select label="Station" value={stationId} onChange={setStationId}
          options={[{ value: "ALL", label: "All stations" }, ...STATIONS.map(s => ({ value: s.id, label: s.name }))]} />
        <Select label="Role" value={role} onChange={setRole}
          options={[{ value: "ALL", label: "All roles" }, { value: "Supervisor", label: "Supervisor" }, { value: "Ticketer", label: "Ticketer" }, { value: "Cashier", label: "Cashier" }]} />
        <Select label="Sex" value={sex} onChange={setSex}
          options={[{ value: "ALL", label: "All" }, { value: "Male", label: "Male" }, { value: "Female", label: "Female" }]} />
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "flex-end" }}>
          <ExportBar
            onCSV={() => exportCSV("staff-roster", headers, [rows])}
            onPDF={() => exportHTML("staff-roster", "Staff Roster", headers, rows)}
          />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 16 }}>
        <SummaryChip label="Total staff" value={filtered.length} color="#2563eb" />
        <SummaryChip label="Supervisors" value={filtered.filter(e => e.role === "Supervisor").length} color="#7c3aed" />
        <SummaryChip label="With POS" value={filtered.filter(e => e.pos).length} color="#16a34a" />
        <SummaryChip label="Total salary" value={fmtCurrency(totalSalary)} color="#d97706" />
      </div>

      <Table headers={headers} rows={rows} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// REPORT 4 — POS Fleet Overview
// ─────────────────────────────────────────────────────────────────────────────

function POSFleetReport() {
  const [stationId, setStationId] = useState("ALL");
  const [status,    setStatus]    = useState("ALL");
  const [version,   setVersion]   = useState("ALL");

  const latestVersion = "ORO Ticket v2.4.1";
  const versions = [...new Set(POS_MACHINES.map(p => p.appVersion))];

  const filtered = POS_MACHINES.filter(p => {
    const st = STATIONS.find(s => s.name === p.station);
    if (stationId !== "ALL" && st?.id !== stationId) return false;
    if (status    !== "ALL" && p.status    !== status)    return false;
    if (version   !== "ALL" && p.appVersion !== version)  return false;
    return true;
  });

  const headers = ["ID", "Serial", "Make", "Model", "Status", "Station", "Operator", "App Version", "Up to date", "Last Assigned"];
  const rows: (string | number)[][] = filtered.map(p => [
    p.id, p.serial, p.make, p.model, p.status,
    p.station, p.employee || "Unassigned",
    p.appVersion,
    p.appVersion === latestVersion ? "✓ Yes" : "✗ No",
    fmtDate(p.lastAssigned),
  ]);

  return (
    <div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        <Select label="Station" value={stationId} onChange={setStationId}
          options={[{ value: "ALL", label: "All stations" }, ...STATIONS.map(s => ({ value: s.id, label: s.name }))]} />
        <Select label="Status" value={status} onChange={setStatus}
          options={[{ value: "ALL", label: "All statuses" }, { value: "Active", label: "Active" }, { value: "Idle", label: "Idle" }, { value: "Maintenance", label: "Maintenance" }, { value: "Decommissioned", label: "Decommissioned" }]} />
        <Select label="App version" value={version} onChange={setVersion}
          options={[{ value: "ALL", label: "All versions" }, ...versions.map(v => ({ value: v, label: v }))]} />
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "flex-end" }}>
          <ExportBar
            onCSV={() => exportCSV("pos-fleet", headers, [rows])}
            onPDF={() => exportHTML("pos-fleet", "POS Fleet Overview", headers, rows)}
          />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 16 }}>
        <SummaryChip label="Total machines" value={filtered.length} color="#2563eb" />
        <SummaryChip label="Active" value={filtered.filter(p => p.status === "Active").length} color="#16a34a" />
        <SummaryChip label="Need update" value={filtered.filter(p => p.appVersion !== latestVersion).length} color="#d97706" />
        <SummaryChip label="In maintenance" value={filtered.filter(p => p.status === "Maintenance").length} color="#dc2626" />
      </div>

      <Table headers={headers} rows={rows} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// REPORT 5 — Station Summary
// ─────────────────────────────────────────────────────────────────────────────

function StationSummaryReport() {
  const [region, setRegion] = useState("ALL");

  const regions = [...new Set(STATIONS.map(s => s.region))];

  const filtered = STATIONS.filter(s => region === "ALL" || s.region === region);

  // Enrich with computed fields
  const enriched = filtered.map(s => {
    const emps     = EMPLOYEES.filter(e => e.stationId === s.id);
    const poses    = POS_MACHINES.filter(p => STATIONS.find(st => st.id === s.id)?.name === p.station);
    const terms    = TERMINALS.filter(t => t.stationId === s.id);
    const totalKm  = terms.reduce((a, t) => a + t.distanceKm, 0);
    const salary   = emps.reduce((a, e) => a + e.salary, 0);
    const pettyCashTotal = PETTY_CASH
      .filter(p => emps.find(e => e.id === p.employeeId))
      .reduce((a, p) => a + p.amount, 0);
    return { ...s, emps, poses, terms, totalKm, salary, pettyCashTotal };
  });

  const headers = ["ID", "Station", "Region", "Zone", "Employees", "Supervisors", "POS Machines", "Active POS", "Terminals", "Total Distance (km)", "Monthly Salary", "Petty Cash Held"];
  const rows: (string | number)[][] = enriched.map(s => [
    s.id, s.name, s.region, s.zone,
    s.emps.length,
    s.emps.filter(e => e.role === "Supervisor").length,
    s.poses.length,
    s.poses.filter(p => p.status === "Active").length,
    s.terms.length,
    s.totalKm.toFixed(1),
    fmtCurrency(s.salary),
    fmtCurrency(s.pettyCashTotal),
  ]);

  const grandSalary     = enriched.reduce((a, s) => a + s.salary, 0);
  const grandPettyCash  = enriched.reduce((a, s) => a + s.pettyCashTotal, 0);

  return (
    <div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        <Select label="Region" value={region} onChange={setRegion}
          options={[{ value: "ALL", label: "All regions" }, ...regions.map(r => ({ value: r, label: r }))]} />
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "flex-end" }}>
          <ExportBar
            onCSV={() => exportCSV("station-summary", headers, [rows])}
            onPDF={() => exportHTML("station-summary", "Station Summary", headers, rows)}
          />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 16 }}>
        <SummaryChip label="Stations" value={enriched.length} color="#2563eb" />
        <SummaryChip label="Total staff" value={enriched.reduce((a, s) => a + s.emps.length, 0)} color="#7c3aed" />
        <SummaryChip label="Total salary" value={fmtCurrency(grandSalary)} color="#d97706" />
        <SummaryChip label="Total petty cash" value={fmtCurrency(grandPettyCash)} color="#dc2626" />
      </div>

      <Table headers={headers} rows={rows} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// REPORT DEFINITIONS
// ─────────────────────────────────────────────────────────────────────────────

const REPORTS: {
  id: ReportId; label: string; description: string;
  icon: React.ReactNode; color: string; lightColor: string;
  component: React.ReactNode;
}[] = [
  {
    id: "fare-summary", label: "Fare Summary",
    description: "Calculated fares for every route × bus type × level combination",
    icon: <Calculator size={18} />, color: "#2563eb", lightColor: "#dbeafe",
    component: <FareSummaryReport />,
  },
  {
    id: "petty-cash-ledger", label: "Petty Cash Ledger",
    description: "Full disbursement log for all supervisors with date range and totals",
    icon: <Wallet size={18} />, color: "#7c3aed", lightColor: "#ede9fe",
    component: <PettyCashLedger />,
  },
  {
    id: "staff-roster", label: "Staff Roster",
    description: "All employees across stations — role, salary, POS assignment",
    icon: <Users size={18} />, color: "#0369a1", lightColor: "#e0f2fe",
    component: <StaffRoster />,
  },
  {
    id: "pos-fleet", label: "POS Fleet",
    description: "All POS machines — status, operator, app version, last assignment date",
    icon: <Monitor size={18} />, color: "#16a34a", lightColor: "#dcfce7",
    component: <POSFleetReport />,
  },
  {
    id: "station-summary", label: "Station Summary",
    description: "Per-station rollup of staff, machines, terminals, salary and petty cash",
    icon: <MapPin size={18} />, color: "#d97706", lightColor: "#fef3c7",
    component: <StationSummaryReport />,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const [activeId, setActiveId] = useState<ReportId>("fare-summary");
  const active = REPORTS.find(r => r.id === activeId)!;

  return (
    <>
      <style>{`* { box-sizing: border-box; } input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; }`}</style>

      <div style={{ minHeight: "100vh", background: "var(--background)", display: "flex", flexDirection: "column" }}>

        {/* ── Page header ── */}
        <div style={{ padding: "28px 32px 0", flexShrink: 0 }}>
          <div style={{ marginBottom: 24 }}>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--foreground)", margin: 0 }}>Reports</h1>
            <p style={{ fontSize: 13, color: "var(--muted-foreground)", margin: "4px 0 0" }}>
              Cross-entity analytical reports · Filter, preview, then export as CSV or PDF
            </p>
          </div>

          {/* ── Report selector tabs ── */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {REPORTS.map(r => {
              const isActive = r.id === activeId;
              return (
                <button key={r.id} onClick={() => setActiveId(r.id)} style={{
                  display: "flex", alignItems: "center", gap: 8,
                  height: 42, padding: "0 16px", borderRadius: 10,
                  border: `1.5px solid ${isActive ? r.color : "var(--border)"}`,
                  background: isActive ? r.lightColor : "var(--surface)",
                  color: isActive ? r.color : "var(--muted-foreground)",
                  fontSize: 13, fontWeight: isActive ? 700 : 500,
                  cursor: "pointer", transition: "all 0.15s",
                  whiteSpace: "nowrap",
                }}>
                  {r.icon}
                  {r.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Active report panel ── */}
        <div style={{ flex: 1, padding: "20px 32px 32px" }}>
          {/* Report header */}
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20, padding: "16px 20px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, borderLeft: `4px solid ${active.color}` }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: active.lightColor, display: "flex", alignItems: "center", justifyContent: "center", color: active.color, flexShrink: 0 }}>
              {active.icon}
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--foreground)" }}>{active.label}</div>
              <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 2 }}>{active.description}</div>
            </div>
          </div>

          {/* Report body */}
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden" }}>
            <div style={{ padding: "20px 20px 0" }}>
              {active.component}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}