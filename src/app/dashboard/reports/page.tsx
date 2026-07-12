"use client";

import { useEffect, useState } from "react";
import {
  FileText, Download, Filter, ChevronDown, ChevronRight,
  MapPin, Users, Monitor, Wallet, Calculator, TrendingUp,
  X, Check, FileSpreadsheet, Printer, RefreshCw, AlertCircle,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type ReportId =
  | "fare-summary"
  | "petty-cash-ledger"
  | "staff-roster"
  | "pos-fleet"
  | "station-summary"
  | "sales-summary";

type StationOption = { id: string; name: string; region: string };
type SupervisorOption = { id: string; firstName: string; lastName: string };

// ─── Shared API helper ────────────────────────────────────────────────────────

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(path);
  const json = await res.json();
  if (!res.ok) throw new Error(json?.message ?? json?.error ?? `Request failed: ${res.status}`);
  return json as T;
}

function qs(params: Record<string, string>) {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v && v !== "ALL") usp.set(k, v);
  return usp.toString();
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtCurrency(n: number) {
  return n.toLocaleString("en-ET", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ETB";
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

// ─── Export helpers — client-side, no extra deps ──────────────────────────────

function exportCSV(filename: string, headers: string[], rows: (string | number)[][]) {
  const csv = [headers, ...rows]
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

function ReportState({ loading, error, onRetry }: { loading: boolean; error: string | null; onRetry: () => void }) {
  if (loading) {
    return (
      <div style={{ padding: "40px 14px", textAlign: "center", color: "var(--muted-foreground)", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
        <RefreshCw size={16} style={{ animation: "spin 1s linear infinite" }} /> Loading report…
      </div>
    );
  }
  if (error) {
    return (
      <div style={{ padding: "40px 14px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
        <AlertCircle size={22} color="#dc2626" />
        <p style={{ fontSize: 13, color: "#dc2626" }}>{error}</p>
        <button onClick={onRetry} style={{ height: 32, padding: "0 12px", borderRadius: 8, border: "1.5px solid var(--border)", background: "var(--surface)", cursor: "pointer", fontSize: 12, fontWeight: 600, color: "var(--foreground)" }}>Retry</button>
      </div>
    );
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// REPORT 1 — Fare Summary
// ─────────────────────────────────────────────────────────────────────────────

const BUS_TYPE_OPTIONS = [{ value: "BUS", label: "Bus" }, { value: "MIDBUS", label: "Midbus" }, { value: "MINIBUS", label: "Minibus" }];
const BUS_LEVEL_OPTIONS = [{ value: "LEVEL_1", label: "Level 1" }, { value: "LEVEL_2", label: "Level 2" }, { value: "LEVEL_3", label: "Level 3" }];

type FareRow = {
  stationName: string; terminalName: string; distanceKm: number; roadType: string;
  busType: string; busLevel: string; asphaltRate: number; gravelRate: number; totalFare: number;
};

function FareSummaryReport({ stations }: { stations: StationOption[] }) {
  const [stationId, setStationId] = useState("ALL");
  const [busType,   setBusType]   = useState("ALL");
  const [busLevel,  setBusLevel]  = useState("ALL");
  const [data,    setData]    = useState<FareRow[]>([]);
  const [summary, setSummary] = useState<{ totalRoutes: number; minFare: number | null; maxFare: number | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  async function load() {
    setLoading(true); setError(null);
    try {
      const res = await apiFetch<{ data: FareRow[]; summary: typeof summary }>(`/api/report?type=fare-summary&${qs({ stationId, busType, busLevel })}`);
      setData(res.data); setSummary(res.summary);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load report.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [stationId, busType, busLevel]);

  const headers = ["Station", "Terminal", "Distance", "Road Type", "Bus Type", "Level", "Asphalt Rate/km", "Gravel Rate/km", "Total Fare"];
  const rows: (string | number)[][] = data.map(r => [
    r.stationName, r.terminalName, `${r.distanceKm} km`, r.roadType,
    r.busType, r.busLevel, fmtCurrency(r.asphaltRate), fmtCurrency(r.gravelRate), fmtCurrency(r.totalFare),
  ]);

  return (
    <div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        <Select label="Station" value={stationId} onChange={setStationId}
          options={[{ value: "ALL", label: "All stations" }, ...stations.map(s => ({ value: s.id, label: s.name }))]} />
        <Select label="Bus type" value={busType} onChange={setBusType}
          options={[{ value: "ALL", label: "All types" }, ...BUS_TYPE_OPTIONS]} />
        <Select label="Bus level" value={busLevel} onChange={setBusLevel}
          options={[{ value: "ALL", label: "All levels" }, ...BUS_LEVEL_OPTIONS]} />
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "flex-end" }}>
          <ExportBar
            onCSV={() => exportCSV("fare-summary", headers, rows)}
            onPDF={() => exportHTML("fare-summary", "Fare Summary Report", headers, rows)}
          />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 16 }}>
        <SummaryChip label="Routes" value={summary?.totalRoutes ?? 0} color="#2563eb" />
        <SummaryChip label="Min fare" value={summary?.minFare != null ? fmtCurrency(summary.minFare) : "—"} color="#16a34a" />
        <SummaryChip label="Max fare" value={summary?.maxFare != null ? fmtCurrency(summary.maxFare) : "—"} color="#d97706" />
      </div>

      <ReportState loading={loading} error={error} onRetry={load} />
      {!loading && !error && <Table headers={headers} rows={rows} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// REPORT 2 — Petty Cash Ledger
// ─────────────────────────────────────────────────────────────────────────────

type PettyCashRow = { employeeName: string; station: string; amount: number; date: string; method: string; reference: string; note: string | null };

function PettyCashLedger({ stations, supervisors }: { stations: StationOption[]; supervisors: SupervisorOption[] }) {
  const [stationId,  setStationId]  = useState("ALL");
  const [employeeId, setEmployeeId] = useState("ALL");
  const [fromDate,   setFromDate]   = useState("");
  const [toDate,     setToDate]     = useState("");
  const [data,    setData]    = useState<PettyCashRow[]>([]);
  const [summary, setSummary] = useState<{ totalRecords: number; totalDisbursed: number; avgPerEntry: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  async function load() {
    setLoading(true); setError(null);
    try {
      const res = await apiFetch<{ data: PettyCashRow[]; summary: typeof summary }>(`/api/report?type=petty-cash-ledger&${qs({ stationId, employeeId, from: fromDate, to: toDate })}`);
      setData(res.data); setSummary(res.summary);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load report.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [stationId, employeeId, fromDate, toDate]);

  const headers = ["Employee", "Station", "Amount (ETB)", "Date", "Method", "Reference", "Note"];
  const rows: (string | number)[][] = data.map(p => [
    p.employeeName, p.station, fmtCurrency(p.amount), fmtDate(p.date), p.method, p.reference, p.note || "—",
  ]);

  return (
    <div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        <Select label="Station" value={stationId} onChange={setStationId}
          options={[{ value: "ALL", label: "All stations" }, ...stations.map(s => ({ value: s.id, label: s.name }))]} />
        <Select label="Supervisor" value={employeeId} onChange={setEmployeeId}
          options={[{ value: "ALL", label: "All supervisors" }, ...supervisors.map(e => ({ value: e.id, label: `${e.firstName} ${e.lastName}` }))]} />
        <DateInput label="From date" value={fromDate} onChange={setFromDate} />
        <DateInput label="To date"   value={toDate}   onChange={setToDate} />
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "flex-end" }}>
          <ExportBar
            onCSV={() => exportCSV("petty-cash-ledger", headers, rows)}
            onPDF={() => exportHTML("petty-cash-ledger", "Petty Cash Ledger", headers, rows)}
          />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 16 }}>
        <SummaryChip label="Disbursements" value={summary?.totalRecords ?? 0} color="#7c3aed" />
        <SummaryChip label="Total disbursed" value={fmtCurrency(summary?.totalDisbursed ?? 0)} color="#dc2626" />
        <SummaryChip label="Avg per entry" value={summary?.totalRecords ? fmtCurrency(summary.avgPerEntry) : "—"} color="#d97706" />
      </div>

      <ReportState loading={loading} error={error} onRetry={load} />
      {!loading && !error && <Table headers={headers} rows={rows} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// REPORT 3 — Staff Roster
// ─────────────────────────────────────────────────────────────────────────────

const ROLE_OPTIONS = [{ value: "SUPERVISOR", label: "Supervisor" }, { value: "TICKETER", label: "Ticketer" }, { value: "CASHIER", label: "Cashier" }];
const SEX_OPTIONS = [{ value: "MALE", label: "Male" }, { value: "FEMALE", label: "Female" }];

type StaffRow = {
  code: string; fullName: string; role: string; stationName: string | null; phone: string;
  sex: string; employmentDate: string | null; basicSalary: number; posMachines: { serial: string }[];
};

function StaffRoster({ stations }: { stations: StationOption[] }) {
  const [stationId, setStationId] = useState("ALL");
  const [role,      setRole]      = useState("ALL");
  const [sex,       setSex]       = useState("ALL");
  const [data,    setData]    = useState<StaffRow[]>([]);
  const [summary, setSummary] = useState<{ totalEmployees: number; withPOS: number; totalSalary: number; byRole: Record<string, number> } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  async function load() {
    setLoading(true); setError(null);
    try {
      const res = await apiFetch<{ data: StaffRow[]; summary: typeof summary }>(`/api/report?type=staff-roster&${qs({ stationId, role, sex })}`);
      setData(res.data); setSummary(res.summary);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load report.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [stationId, role, sex]);

  const headers = ["Code", "Full Name", "Role", "Station", "Phone", "Sex", "Employment Date", "Salary (ETB)", "POS Assigned"];
  const rows: (string | number)[][] = data.map(e => [
    e.code, e.fullName, e.role, e.stationName ?? "—", e.phone, e.sex,
    fmtDate(e.employmentDate), fmtCurrency(e.basicSalary), e.posMachines[0]?.serial ?? "—",
  ]);

  return (
    <div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        <Select label="Station" value={stationId} onChange={setStationId}
          options={[{ value: "ALL", label: "All stations" }, ...stations.map(s => ({ value: s.id, label: s.name }))]} />
        <Select label="Role" value={role} onChange={setRole}
          options={[{ value: "ALL", label: "All roles" }, ...ROLE_OPTIONS]} />
        <Select label="Sex" value={sex} onChange={setSex}
          options={[{ value: "ALL", label: "All" }, ...SEX_OPTIONS]} />
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "flex-end" }}>
          <ExportBar
            onCSV={() => exportCSV("staff-roster", headers, rows)}
            onPDF={() => exportHTML("staff-roster", "Staff Roster", headers, rows)}
          />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 16 }}>
        <SummaryChip label="Total staff" value={summary?.totalEmployees ?? 0} color="#2563eb" />
        <SummaryChip label="Supervisors" value={summary?.byRole?.SUPERVISOR ?? 0} color="#7c3aed" />
        <SummaryChip label="With POS" value={summary?.withPOS ?? 0} color="#16a34a" />
        <SummaryChip label="Total salary" value={fmtCurrency(summary?.totalSalary ?? 0)} color="#d97706" />
      </div>

      <ReportState loading={loading} error={error} onRetry={load} />
      {!loading && !error && <Table headers={headers} rows={rows} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// REPORT 4 — POS Fleet Overview
// ─────────────────────────────────────────────────────────────────────────────

const POS_STATUS_OPTIONS = [{ value: "ACTIVE", label: "Active" }, { value: "IDLE", label: "Idle" }, { value: "MAINTENANCE", label: "Maintenance" }, { value: "DECOMMISSIONED", label: "Decommissioned" }];

type PosFleetRow = {
  code: string; serial: string; make: string; model: string; status: string;
  stationName: string | null; employeeName: string | null; appVersion: string;
  isUpToDate: boolean | null; currentAssignmentSince: string | null;
};

function POSFleetReport({ stations }: { stations: StationOption[] }) {
  const [stationId, setStationId] = useState("ALL");
  const [status,    setStatus]    = useState("ALL");
  const [version,   setVersion]   = useState("ALL");
  const [data,    setData]    = useState<PosFleetRow[]>([]);
  const [summary, setSummary] = useState<{ total: number; byStatus: Record<string, number>; outdated: number | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  async function load() {
    setLoading(true); setError(null);
    try {
      const res = await apiFetch<{ data: PosFleetRow[]; summary: typeof summary }>(`/api/report?type=pos-fleet&${qs({ stationId, status })}`);
      setData(res.data); setSummary(res.summary);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load report.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [stationId, status]);

  const versions = [...new Set(data.map(p => p.appVersion))];
  const filtered = version === "ALL" ? data : data.filter(p => p.appVersion === version);

  const headers = ["Code", "Serial", "Make", "Model", "Status", "Station", "Operator", "App Version", "Up to date", "Assigned since"];
  const rows: (string | number)[][] = filtered.map(p => [
    p.code, p.serial, p.make, p.model, p.status,
    p.stationName ?? "—", p.employeeName ?? "Unassigned",
    p.appVersion,
    p.isUpToDate ? "✓ Yes" : "✗ No",
    fmtDate(p.currentAssignmentSince),
  ]);

  return (
    <div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        <Select label="Station" value={stationId} onChange={setStationId}
          options={[{ value: "ALL", label: "All stations" }, ...stations.map(s => ({ value: s.id, label: s.name }))]} />
        <Select label="Status" value={status} onChange={setStatus}
          options={[{ value: "ALL", label: "All statuses" }, ...POS_STATUS_OPTIONS]} />
        <Select label="App version" value={version} onChange={setVersion}
          options={[{ value: "ALL", label: "All versions" }, ...versions.map(v => ({ value: v, label: v }))]} />
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "flex-end" }}>
          <ExportBar
            onCSV={() => exportCSV("pos-fleet", headers, rows)}
            onPDF={() => exportHTML("pos-fleet", "POS Fleet Overview", headers, rows)}
          />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 16 }}>
        <SummaryChip label="Total machines" value={filtered.length} color="#2563eb" />
        <SummaryChip label="Active" value={summary?.byStatus?.ACTIVE ?? 0} color="#16a34a" />
        <SummaryChip label="Need update" value={summary?.outdated ?? 0} color="#d97706" />
        <SummaryChip label="In maintenance" value={summary?.byStatus?.MAINTENANCE ?? 0} color="#dc2626" />
      </div>

      <ReportState loading={loading} error={error} onRetry={load} />
      {!loading && !error && <Table headers={headers} rows={rows} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// REPORT 5 — Station Summary
// ─────────────────────────────────────────────────────────────────────────────

type StationSummaryRow = {
  code: string; name: string; region: string; zone: string;
  employeeCount: number; supervisorCount: number; posMachineCount: number; activePosCount: number;
  terminalCount: number; totalDistanceKm: number; monthlySalary: number; totalPettyCash: number;
};

function StationSummaryReport({ stations }: { stations: StationOption[] }) {
  const [region, setRegion] = useState("ALL");
  const [data,    setData]    = useState<StationSummaryRow[]>([]);
  const [summary, setSummary] = useState<{ totalStations: number; totalEmployees: number; grandMonthlySalary: number; grandPettyCash: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const regions = [...new Set(stations.map(s => s.region))];

  async function load() {
    setLoading(true); setError(null);
    try {
      const res = await apiFetch<{ data: StationSummaryRow[]; summary: typeof summary }>(`/api/report?type=station-summary&${qs({ region })}`);
      setData(res.data); setSummary(res.summary);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load report.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [region]);

  const headers = ["Code", "Station", "Region", "Zone", "Employees", "Supervisors", "POS Machines", "Active POS", "Terminals", "Total Distance (km)", "Monthly Salary", "Petty Cash Held"];
  const rows: (string | number)[][] = data.map(s => [
    s.code, s.name, s.region, s.zone,
    s.employeeCount, s.supervisorCount, s.posMachineCount, s.activePosCount,
    s.terminalCount, s.totalDistanceKm.toFixed(1),
    fmtCurrency(s.monthlySalary), fmtCurrency(s.totalPettyCash),
  ]);

  return (
    <div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        <Select label="Region" value={region} onChange={setRegion}
          options={[{ value: "ALL", label: "All regions" }, ...regions.map(r => ({ value: r, label: r }))]} />
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "flex-end" }}>
          <ExportBar
            onCSV={() => exportCSV("station-summary", headers, rows)}
            onPDF={() => exportHTML("station-summary", "Station Summary", headers, rows)}
          />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 16 }}>
        <SummaryChip label="Stations" value={summary?.totalStations ?? 0} color="#2563eb" />
        <SummaryChip label="Total staff" value={summary?.totalEmployees ?? 0} color="#7c3aed" />
        <SummaryChip label="Total salary" value={fmtCurrency(summary?.grandMonthlySalary ?? 0)} color="#d97706" />
        <SummaryChip label="Total petty cash" value={fmtCurrency(summary?.grandPettyCash ?? 0)} color="#dc2626" />
      </div>

      <ReportState loading={loading} error={error} onRetry={load} />
      {!loading && !error && <Table headers={headers} rows={rows} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// REPORT 6 — Sales Summary (earnings per ticketer, mirrored from OTA)
// ─────────────────────────────────────────────────────────────────────────────

type SalesTicketerRow = {
  employeeId: string; employeeName: string; trips: number; passengers: number;
  distanceKm: number; tariff: number; totalServiceCharge: number; totalCollected: number;
};

type SalesFilterOptions = { departureTerminals: string[]; arrivalTerminals: string[] };

function SalesSummaryReport() {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo,   setDateTo]   = useState("");
  const [departureTerminal, setDepartureTerminal] = useState("ALL");
  const [arrivalTerminal,   setArrivalTerminal]   = useState("ALL");
  const [filterOptions, setFilterOptions] = useState<SalesFilterOptions>({ departureTerminals: [], arrivalTerminals: [] });
  const [data,    setData]    = useState<SalesTicketerRow[]>([]);
  const [summary, setSummary] = useState<{ totalTicketers: number; trips: number; passengers: number; distanceKm: number; tariff: number; totalServiceCharge: number; totalCollected: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    apiFetch<SalesFilterOptions>("/api/sales/filter-options").then(setFilterOptions).catch(() => {});
  }, []);

  async function load() {
    setLoading(true); setError(null);
    try {
      const res = await apiFetch<{ data: SalesTicketerRow[]; summary: typeof summary }>(`/api/report?type=sales-summary&${qs({ dateFrom, dateTo, departureTerminal, arrivalTerminal })}`);
      setData(res.data); setSummary(res.summary);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load report.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [dateFrom, dateTo, departureTerminal, arrivalTerminal]);

  const headers = ["Ticketer", "Trips", "Passengers", "Distance (km)", "Tariff", "Service Charge Collected", "Total Collected"];
  const rows: (string | number)[][] = data.map(r => [
    r.employeeName, r.trips, r.passengers, r.distanceKm.toFixed(1),
    fmtCurrency(r.tariff), fmtCurrency(r.totalServiceCharge), fmtCurrency(r.totalCollected),
  ]);

  return (
    <div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        <DateInput label="From date" value={dateFrom} onChange={setDateFrom} />
        <DateInput label="To date"   value={dateTo}   onChange={setDateTo} />
        <Select label="Departure station" value={departureTerminal} onChange={setDepartureTerminal}
          options={[{ value: "ALL", label: "All stations" }, ...filterOptions.departureTerminals.map(t => ({ value: t, label: t }))]} />
        <Select label="Arrival station" value={arrivalTerminal} onChange={setArrivalTerminal}
          options={[{ value: "ALL", label: "All destinations" }, ...filterOptions.arrivalTerminals.map(t => ({ value: t, label: t }))]} />
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "flex-end" }}>
          <ExportBar
            onCSV={() => exportCSV("sales-summary", headers, rows)}
            onPDF={() => exportHTML("sales-summary", "Sales Summary — Earnings per Ticketer", headers, rows)}
          />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 16 }}>
        <SummaryChip label="Ticketers" value={summary?.totalTicketers ?? 0} color="#2563eb" />
        <SummaryChip label="Trips" value={summary?.trips ?? 0} color="#7c3aed" />
        <SummaryChip label="Passengers" value={summary?.passengers ?? 0} color="#0369a1" />
        <SummaryChip label="Total collected" value={fmtCurrency(summary?.totalCollected ?? 0)} color="#16a34a" />
      </div>

      <ReportState loading={loading} error={error} onRetry={load} />
      {!loading && !error && <Table headers={headers} rows={rows} emptyMsg="No sales trips match these filters." />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────────────────────

const REPORT_DEFS: { id: ReportId; label: string; description: string; icon: React.ReactNode; color: string; lightColor: string }[] = [
  { id: "fare-summary", label: "Fare Summary", description: "Calculated fares for every route × bus type × level combination", icon: <Calculator size={18} />, color: "#2563eb", lightColor: "#dbeafe" },
  { id: "petty-cash-ledger", label: "Petty Cash Ledger", description: "Full disbursement log for all supervisors with date range and totals", icon: <Wallet size={18} />, color: "#7c3aed", lightColor: "#ede9fe" },
  { id: "staff-roster", label: "Staff Roster", description: "All employees across stations — role, salary, POS assignment", icon: <Users size={18} />, color: "#0369a1", lightColor: "#e0f2fe" },
  { id: "pos-fleet", label: "POS Fleet", description: "All POS machines — status, operator, app version, last assignment date", icon: <Monitor size={18} />, color: "#16a34a", lightColor: "#dcfce7" },
  { id: "station-summary", label: "Station Summary", description: "Per-station rollup of staff, machines, terminals, salary and petty cash", icon: <MapPin size={18} />, color: "#d97706", lightColor: "#fef3c7" },
  { id: "sales-summary", label: "Sales Summary", description: "Earnings per ticketer, mirrored from the OTA ticketing system", icon: <TrendingUp size={18} />, color: "#16a34a", lightColor: "#dcfce7" },
];

export default function ReportsPage() {
  const [activeId, setActiveId] = useState<ReportId>("fare-summary");
  const [stations, setStations] = useState<StationOption[]>([]);
  const [supervisors, setSupervisors] = useState<SupervisorOption[]>([]);
  const [refLoading, setRefLoading] = useState(true);
  const [refError, setRefError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setRefLoading(true); setRefError(null);
      try {
        const [stationsRes, employeesRes] = await Promise.all([
          apiFetch<{ data: StationOption[] }>("/api/stations?limit=1000"),
          apiFetch<{ data: (SupervisorOption & { role: string })[] }>("/api/employees?role=SUPERVISOR&limit=1000"),
        ]);
        setStations(stationsRes.data);
        setSupervisors(employeesRes.data);
      } catch (e) {
        setRefError(e instanceof Error ? e.message : "Failed to load reference data.");
      } finally {
        setRefLoading(false);
      }
    })();
  }, []);

  const active = REPORT_DEFS.find(r => r.id === activeId)!;

  return (
    <>
      <style>{`
        * { box-sizing: border-box; }
        input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

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
            {REPORT_DEFS.map(r => {
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
              {refLoading ? (
                <ReportState loading error={null} onRetry={() => {}} />
              ) : refError ? (
                <ReportState loading={false} error={refError} onRetry={() => window.location.reload()} />
              ) : (
                <>
                  {activeId === "fare-summary" && <FareSummaryReport stations={stations} />}
                  {activeId === "petty-cash-ledger" && <PettyCashLedger stations={stations} supervisors={supervisors} />}
                  {activeId === "staff-roster" && <StaffRoster stations={stations} />}
                  {activeId === "pos-fleet" && <POSFleetReport stations={stations} />}
                  {activeId === "station-summary" && <StationSummaryReport stations={stations} />}
                  {activeId === "sales-summary" && <SalesSummaryReport />}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
