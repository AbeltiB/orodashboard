"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
  TrendingUp, RefreshCw, Check, AlertCircle, History,
  MapPin, User, Truck, ChevronLeft, ChevronRight, ChevronDown, Loader2,
  Route as RouteIcon, Users as UsersIcon, Gauge, Wallet, Coins, X, Calendar,
  FileSpreadsheet, Printer,
} from "lucide-react";
import {
  ETHIOPIAN_MONTH_NAMES, dateToEthiopian, ethiopianToGregorian,
  formatEthiopianDate, gregorianToEthiopian, isEthiopianLeap,
} from "@/lib/ethiopian-calendar";

// ─── Types matching the sales API ──────────────────────────────────────────────

type SyncSource = "MANUAL" | "AUTO";
type SyncStatus = "SUCCESS" | "FAILED" | "PARTIAL" | "SKIPPED" | "RATE_LIMITED";

type SalesTrip = {
  id: string;
  date: string;
  distanceKm: number;
  tariff: number;
  serviceCharge: number;
  totalServiceCharge: number;
  passengers: number;
  level: string;
  departureTerminalName: string;
  arrivalTerminalName: string;
  employee: { id: string; name: string | null; email: string | null } | null;
  vehicle: { id: string; plateNo: string | null; plateCode: string | null; fleetCategory: string | null } | null;
};

type SalesTotals = { tariff: number; serviceCharge: number; totalServiceCharge: number; distanceKm: number; passengers: number };

type SalesSyncLog = {
  id: string;
  source: SyncSource;
  triggeredBy: string | null;
  windowFrom: string | null;
  windowTo: string;
  status: SyncStatus;
  passes: number;
  pagesFetched: number;
  rowsFetched: number;
  rowsCreated: number;
  rowsUpdated: number;
  sourceTotal: number | null;
  ourTotal: number | null;
  rateLimitedUntil: string | null;
  errorMessage: string | null;
  startedAt: string;
  finishedAt: string | null;
};

type FilterOptions = {
  departureTerminals: string[];
  arrivalTerminals: string[];
  employees: { id: string; name: string }[];
};

type TicketerRow = {
  employeeId: string;
  employeeName: string;
  trips: number;
  passengers: number;
  distanceKm: number;
  tariff: number;
  totalServiceCharge: number;
  totalCollected: number;
};

// One ticketer's trips grouped by calendar day x route in a single row —
// the raw material the detail drill-down re-slices into "by route" and
// "by date" views client-side, and expands per date into routes worked.
type TicketerBreakdownRow = {
  date: string; // yyyy-mm-dd
  departureTerminalName: string;
  arrivalTerminalName: string;
  trips: number;
  passengers: number;
  distanceKm: number;
  tariff: number;
  totalServiceCharge: number;
  totalCollected: number;
};

type RouteAggregate = { departure: string; arrival: string; trips: number; passengers: number; distanceKm: number; tariff: number; totalServiceCharge: number; totalCollected: number };
type DateAggregate = { date: string; trips: number; passengers: number; distanceKm: number; tariff: number; totalServiceCharge: number; totalCollected: number };

type SyncProgressEvent =
  | { type: "probe-start" }
  | { type: "probe-result"; sourceTotal: number; ourTotal: number }
  | { type: "pass-start"; pass: number; maxPasses: number }
  | { type: "page"; pass: number; page: number; pages: number; rowsSoFar: number }
  | { type: "pass-done"; pass: number; rowsFetched: number; rowsCreated: number; rowsUpdated: number }
  | { type: "skipped"; reason: string }
  | { type: "rate-limited"; retryAfterSeconds: number };

type SyncApiResult = {
  status: SyncStatus; passes: number; rowsFetched: number; rowsCreated: number; rowsUpdated: number;
  pagesFetched: number; sourceTotal: number | null; ourTotal: number | null; errorMessage: string | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { headers: { "Content-Type": "application/json" }, ...init });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error ?? `Request failed: ${res.status}`);
  return json as T;
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
// Fraction-of-a-second precision — the source can log several trips within
// the same second, so plain minute/second display isn't enough to tell them
// apart at a glance.
function fmtDateTimeMs(iso: string) {
  const d = new Date(iso);
  const datePart = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  const ms = String(d.getMilliseconds()).padStart(3, "0");
  return `${datePart}, ${h}:${m}:${s}.${ms}`;
}
function fmtMoney(n: number) {
  return n.toLocaleString("en-ET", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
// dateStr is a plain yyyy-mm-dd (day-truncated) — not an instant, so this
// formats it directly rather than routing through local-timezone Date math.
function fmtDay(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
}
function ethiopianDayLabel(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return `${formatEthiopianDate(dateToEthiopian(d))} E.C.`;
}
function statusStyle(s: SyncStatus): { bg: string; fg: string } {
  if (s === "SUCCESS") return { bg: "#dcfce7", fg: "#16a34a" };
  if (s === "PARTIAL") return { bg: "#fef3c7", fg: "#d97706" };
  if (s === "SKIPPED") return { bg: "#f1f5f9", fg: "#64748b" };
  if (s === "RATE_LIMITED") return { bg: "#ede9fe", fg: "#7c3aed" };
  return { bg: "#fee2e2", fg: "#dc2626" };
}

function progressLine(e: SyncProgressEvent): string {
  switch (e.type) {
    case "probe-start": return "Checking how many trips exist on the source…";
    case "probe-result": {
      const diff = e.sourceTotal - e.ourTotal;
      return diff <= 0
        ? `Source has ${e.sourceTotal.toLocaleString()} trips — already fully on file.`
        : `Source has ${e.sourceTotal.toLocaleString()} trips, we have ${e.ourTotal.toLocaleString()} — ${diff.toLocaleString()} to fetch.`;
    }
    case "pass-start": return `Pass ${e.pass}/${e.maxPasses}: walking the full table…`;
    case "page": return `Pass ${e.pass}: page ${e.page}/${e.pages} — ${e.rowsSoFar.toLocaleString()} rows fetched so far`;
    case "pass-done": return `Pass ${e.pass} done — ${e.rowsCreated.toLocaleString()} new, ${e.rowsUpdated.toLocaleString()} already known`;
    case "skipped": return e.reason;
    case "rate-limited": return `Rate limited by the source — cooling down for about ${Math.round(e.retryAfterSeconds / 60)} min.`;
  }
}

// ─── Export — client-side, no extra deps (same pattern as the Reports page).
// CSV opens fine in Excel directly, so one file covers both; "PDF" is a
// print-ready HTML doc opened in a new tab with window.print() fired
// automatically, so the browser's own "Save as PDF" covers PDF and Print
// with the same code path. ──────────────────────────────────────────────

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

function exportHTML(filename: string, title: string, subtitle: string, headers: string[], rows: (string | number)[][]) {
  const rowsHtml = rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join("")}</tr>`).join("");
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
    <title>${title}</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 32px; color: #0f172a; }
      h1 { font-size: 20px; margin-bottom: 4px; }
      p.meta { font-size: 12px; color: #64748b; margin-bottom: 24px; }
      table { width: 100%; border-collapse: collapse; font-size: 11px; }
      th { background: #1d4ed8; color: #fff; padding: 8px 10px; text-align: left; font-weight: 600; white-space: nowrap; }
      td { padding: 7px 10px; border-bottom: 1px solid #e2e8f0; white-space: nowrap; }
      tr:nth-child(even) td { background: #f8fafc; }
      @media print { body { padding: 16px; } }
    </style>
  </head><body>
    <h1>${title}</h1>
    <p class="meta">OroDashboard · Generated ${new Date().toLocaleString("en-GB")} · ${subtitle}</p>
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

const iCss: React.CSSProperties = {
  height: 38, padding: "0 12px", border: "1.5px solid var(--border)", borderRadius: 9,
  background: "var(--surface)", color: "var(--foreground)", fontSize: 13, outline: "none",
};
const selCss: React.CSSProperties = { ...iCss, cursor: "pointer" };

function Field({ label, children, span }: { label: string; children: React.ReactNode; span?: number }) {
  return (
    <div style={{ gridColumn: span ? `span ${span}` : undefined }}>
      <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--muted-foreground)", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</label>
      {children}
    </div>
  );
}

function Badge({ label, bg, fg }: { label: string; bg: string; fg: string }) {
  return <span style={{ display: "inline-flex", alignItems: "center", padding: "2px 10px", borderRadius: 999, fontSize: 11, fontWeight: 600, background: bg, color: fg }}>{label}</span>;
}

function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useState(() => { const t = setTimeout(onDone, 3200); return () => clearTimeout(t); });
  return (
    <div style={{ position: "fixed", bottom: 28, right: 28, zIndex: 9999, background: "#0f172a", color: "#fff", padding: "12px 20px", borderRadius: 12, fontSize: 14, fontWeight: 500, display: "flex", alignItems: "center", gap: 8, boxShadow: "0 8px 30px rgb(0 0 0 / 0.18)", maxWidth: 420 }}>
      <Check size={15} strokeWidth={2.5} color="#4ade80" style={{ flexShrink: 0 }} />{message}
    </div>
  );
}

// ─── Ethiopian date input (day/month/year) — mirrors a Gregorian ISO value ────

function daysInEthiopianMonth(month: number, year: number): number {
  if (month < 13) return 30;
  return isEthiopianLeap(year) ? 6 : 5;
}

function EthiopianDateInput({ value, onChange }: { value: string; onChange: (isoDate: string) => void }) {
  const eth = (() => {
    if (!value) return null;
    const [y, m, d] = value.split("-").map(Number);
    if (!y || !m || !d) return null;
    return gregorianToEthiopian(y, m, d);
  })();

  function set(year: number | null, month: number | null, day: number | null) {
    const y = year ?? eth?.year ?? null;
    const m = month ?? eth?.month ?? null;
    const d = day ?? eth?.day ?? null;
    if (y && m && d) {
      const g = ethiopianToGregorian(y, m, d);
      onChange(`${g.year}-${String(g.month).padStart(2, "0")}-${String(g.day).padStart(2, "0")}`);
    }
  }

  const maxDay = eth ? daysInEthiopianMonth(eth.month, eth.year) : 30;

  return (
    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
      <input type="number" placeholder="Day" min={1} max={maxDay} value={eth?.day ?? ""}
        onChange={e => set(null, null, e.target.value ? Number(e.target.value) : null)}
        style={{ ...iCss, width: 54, padding: "0 6px", textAlign: "center" }} />
      <select value={eth?.month ?? ""} onChange={e => set(null, e.target.value ? Number(e.target.value) : null, null)} style={{ ...selCss, width: 108, padding: "0 6px" }}>
        <option value="">Month</option>
        {ETHIOPIAN_MONTH_NAMES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
      </select>
      <input type="number" placeholder="Year" value={eth?.year ?? ""}
        onChange={e => set(e.target.value ? Number(e.target.value) : null, null, null)}
        style={{ ...iCss, width: 70, padding: "0 6px", textAlign: "center" }} />
      {value && (
        <button onClick={() => onChange("")} title="Clear" style={{ width: 28, height: 28, borderRadius: 7, border: "1.5px solid var(--border)", background: "var(--surface)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted-foreground)", flexShrink: 0 }}>
          <X size={12} />
        </button>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 50;
const EMPTY_TOTALS: SalesTotals = { tariff: 0, serviceCharge: 0, totalServiceCharge: 0, distanceKm: 0, passengers: 0 };

export default function SalesPage() {
  const [trips, setTrips] = useState<SalesTrip[]>([]);
  const [total, setTotal] = useState(0);
  const [totals, setTotals] = useState<SalesTotals>(EMPTY_TOTALS);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [departureTerminal, setDepartureTerminal] = useState("");
  const [arrivalTerminal, setArrivalTerminal] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [plateNo, setPlateNo] = useState("");
  const [search, setSearch] = useState("");
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({ departureTerminals: [], arrivalTerminals: [], employees: [] });

  const [syncing, setSyncing] = useState(false);
  const [syncStatusLine, setSyncStatusLine] = useState<string | null>(null);
  const [syncLog, setSyncLog] = useState<string[]>([]);
  const [syncProgressFrac, setSyncProgressFrac] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<"csv" | "pdf" | null>(null);

  const [logs, setLogs] = useState<SalesSyncLog[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const [view, setView] = useState<"trips" | "by-ticketer">("trips");
  const [byTicketer, setByTicketer] = useState<TicketerRow[]>([]);
  const [byTicketerLoading, setByTicketerLoading] = useState(false);

  // Per-ticketer drill-down: which row is expanded, its raw day x route
  // data, which sub-view (route totals vs. date totals) is showing, and
  // which date (in the date sub-view) is further expanded into routes.
  const [expandedTicketer, setExpandedTicketer] = useState<string | null>(null);
  const [ticketerBreakdown, setTicketerBreakdown] = useState<TicketerBreakdownRow[]>([]);
  const [ticketerBreakdownLoading, setTicketerBreakdownLoading] = useState(false);
  const [ticketerDetailView, setTicketerDetailView] = useState<"route" | "date">("date");
  const [expandedDate, setExpandedDate] = useState<string | null>(null);

  const buildFilterParams = useCallback(() => {
    const params = new URLSearchParams();
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    if (departureTerminal) params.set("departureTerminal", departureTerminal);
    if (arrivalTerminal) params.set("arrivalTerminal", arrivalTerminal);
    if (employeeId) params.set("employeeId", employeeId);
    if (plateNo) params.set("plateNo", plateNo);
    if (search) params.set("search", search);
    return params;
  }, [dateFrom, dateTo, departureTerminal, arrivalTerminal, employeeId, plateNo, search]);

  const loadTrips = useCallback(async () => {
    setLoading(true);
    try {
      const params = buildFilterParams();
      params.set("offset", String(offset));
      params.set("limit", String(PAGE_SIZE));
      const res = await apiFetch<{ data: SalesTrip[]; meta: { total: number }; totals: SalesTotals }>(`/api/sales/trips?${params.toString()}`);
      setTrips(res.data);
      setTotal(res.meta.total);
      setTotals(res.totals);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load trips.");
    } finally {
      setLoading(false);
    }
  }, [offset, buildFilterParams]);

  const loadByTicketer = useCallback(async () => {
    setByTicketerLoading(true);
    try {
      const res = await apiFetch<{ data: TicketerRow[] }>(`/api/sales/by-ticketer?${buildFilterParams().toString()}`);
      setByTicketer(res.data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load ticketer earnings.");
    } finally {
      setByTicketerLoading(false);
    }
  }, [buildFilterParams]);

  const loadTicketerBreakdown = useCallback(async (empId: string) => {
    setTicketerBreakdownLoading(true);
    try {
      // employeeId comes from the path here, not the query — drop the
      // global ticketer filter (if set) from the params so it can't be
      // misread as scoping this specific ticketer's own breakdown.
      const params = buildFilterParams();
      params.delete("employeeId");
      const res = await apiFetch<{ data: TicketerBreakdownRow[] }>(`/api/sales/by-ticketer/${empId}/breakdown?${params.toString()}`);
      setTicketerBreakdown(res.data);
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Failed to load ticketer breakdown.");
    } finally {
      setTicketerBreakdownLoading(false);
    }
  }, [buildFilterParams]);

  useEffect(() => {
    if (expandedTicketer) loadTicketerBreakdown(expandedTicketer);
  }, [expandedTicketer, loadTicketerBreakdown]);

  function toggleTicketer(empId: string) {
    setExpandedDate(null);
    setExpandedTicketer(prev => (prev === empId ? null : empId));
  }

  const ticketerByRoute = useMemo<RouteAggregate[]>(() => {
    const map = new Map<string, RouteAggregate>();
    for (const r of ticketerBreakdown) {
      const key = `${r.departureTerminalName}→${r.arrivalTerminalName}`;
      const cur = map.get(key) ?? { departure: r.departureTerminalName, arrival: r.arrivalTerminalName, trips: 0, passengers: 0, distanceKm: 0, tariff: 0, totalServiceCharge: 0, totalCollected: 0 };
      cur.trips += r.trips; cur.passengers += r.passengers; cur.distanceKm += r.distanceKm;
      cur.tariff += r.tariff; cur.totalServiceCharge += r.totalServiceCharge; cur.totalCollected += r.totalCollected;
      map.set(key, cur);
    }
    return [...map.values()].sort((a, b) => b.totalCollected - a.totalCollected);
  }, [ticketerBreakdown]);

  const ticketerByDate = useMemo<DateAggregate[]>(() => {
    const map = new Map<string, DateAggregate>();
    for (const r of ticketerBreakdown) {
      const cur = map.get(r.date) ?? { date: r.date, trips: 0, passengers: 0, distanceKm: 0, tariff: 0, totalServiceCharge: 0, totalCollected: 0 };
      cur.trips += r.trips; cur.passengers += r.passengers; cur.distanceKm += r.distanceKm;
      cur.tariff += r.tariff; cur.totalServiceCharge += r.totalServiceCharge; cur.totalCollected += r.totalCollected;
      map.set(r.date, cur);
    }
    return [...map.values()].sort((a, b) => b.date.localeCompare(a.date));
  }, [ticketerBreakdown]);

  // Grand total across whatever's currently loaded — already scoped by the
  // active date range / route / plate filters, so this is literally "the
  // sum for that date (range)" the moment a date filter is set above.
  const ticketerFilteredSummary = useMemo(() => {
    return ticketerBreakdown.reduce(
      (acc, r) => ({
        trips: acc.trips + r.trips,
        passengers: acc.passengers + r.passengers,
        distanceKm: acc.distanceKm + r.distanceKm,
        tariff: acc.tariff + r.tariff,
        totalServiceCharge: acc.totalServiceCharge + r.totalServiceCharge,
        totalCollected: acc.totalCollected + r.totalCollected,
      }),
      { trips: 0, passengers: 0, distanceKm: 0, tariff: 0, totalServiceCharge: 0, totalCollected: 0 }
    );
  }, [ticketerBreakdown]);

  const loadLogs = useCallback(async () => {
    try {
      const res = await apiFetch<{ data: SalesSyncLog[] }>("/api/sales/sync?limit=10");
      setLogs(res.data);
    } catch {
      // sync history is a secondary panel — a failed load shouldn't block the page
    }
  }, []);

  const loadFilterOptions = useCallback(async () => {
    try {
      const res = await apiFetch<FilterOptions>("/api/sales/filter-options");
      setFilterOptions(res);
    } catch {
      // dropdowns just stay empty — the free-text search still works
    }
  }, []);

  useEffect(() => { if (view === "trips") loadTrips(); }, [view, loadTrips]);
  useEffect(() => { if (view === "by-ticketer") loadByTicketer(); }, [view, loadByTicketer]);
  useEffect(() => { loadLogs(); }, [loadLogs]);
  useEffect(() => { loadFilterOptions(); }, [loadFilterOptions]);

  function applyProgressEvent(e: SyncProgressEvent) {
    setSyncStatusLine(progressLine(e));
    setSyncLog(prev => [...prev.slice(-7), progressLine(e)]);
    if (e.type === "page") setSyncProgressFrac(e.pages > 0 ? e.page / e.pages : null);
    if (e.type === "pass-done" || e.type === "probe-start") setSyncProgressFrac(null);
  }

  async function handleSync() {
    setSyncing(true);
    setSyncLog([]);
    setSyncProgressFrac(null);
    setSyncStatusLine("Starting sync…");
    try {
      const res = await fetch("/api/sales/sync?stream=1", { method: "POST" });
      if (!res.ok || !res.body) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.message ?? `Sync failed (HTTP ${res.status}).`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalResult: SyncApiResult | null = null;
      let streamError: string | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith("data:")) continue;
          const payload = JSON.parse(line.slice(5).trim()) as
            | { kind: "progress"; event: SyncProgressEvent }
            | { kind: "done"; result: SyncApiResult }
            | { kind: "error"; message: string };
          if (payload.kind === "progress") applyProgressEvent(payload.event);
          else if (payload.kind === "done") finalResult = payload.result;
          else if (payload.kind === "error") streamError = payload.message;
        }
      }

      if (streamError) throw new Error(streamError);

      if (finalResult) {
        const res2 = finalResult;
        if (res2.status === "RATE_LIMITED") {
          setToast("Rate limited by the source — will retry automatically once the cooldown passes.");
        } else if (res2.status === "SKIPPED" && res2.errorMessage) {
          setToast(res2.errorMessage);
        } else if (res2.status === "SKIPPED") {
          setToast(`Already up to date — ${res2.ourTotal?.toLocaleString() ?? "?"} trips, nothing new on the source.`);
        } else {
          const gap = res2.sourceTotal !== null && res2.ourTotal !== null ? res2.sourceTotal - res2.ourTotal : null;
          setToast(
            `Synced: ${res2.rowsCreated} new, ${res2.rowsUpdated} already known (${res2.passes} pass${res2.passes === 1 ? "" : "es"}, ${res2.pagesFetched} page${res2.pagesFetched === 1 ? "" : "s"})` +
            (gap !== null ? gap === 0 ? " — fully caught up" : ` — still ${gap} behind the source, will retry next sync` : "")
          );
        }
      }

      setOffset(0);
      await Promise.all([view === "trips" ? loadTrips() : loadByTicketer(), loadLogs()]);
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(false);
      setSyncStatusLine(null);
      setSyncProgressFrac(null);
    }
  }

  function clearFilters() {
    setDateFrom(""); setDateTo(""); setDepartureTerminal(""); setArrivalTerminal("");
    setEmployeeId(""); setPlateNo(""); setSearch(""); setOffset(0);
  }
  const filtersActive = !!(dateFrom || dateTo || departureTerminal || arrivalTerminal || employeeId || plateNo || search);

  // Printing (and its "Save as PDF") happens in an actual browser tab, so it
  // needs a sane cap — CSV has none, since "no filter = everything" applies
  // there regardless of size.
  const MAX_PRINT_ROWS = 3000;

  async function handleExport(format: "csv" | "pdf") {
    const rowCountKnown = view === "trips" ? total : byTicketer.length;
    if (format === "pdf" && rowCountKnown > MAX_PRINT_ROWS) {
      setToast(`${rowCountKnown.toLocaleString()} rows is too many to print at once — narrow your filters first, or use CSV instead.`);
      return;
    }

    setExporting(format);
    try {
      const label = filtersActive ? "Filtered" : "All";
      const stamp = new Date().toISOString().slice(0, 10);

      if (view === "by-ticketer") {
        const headers = ["Ticketer", "Trips", "Passengers", "Distance (km)", "Tariff", "Service charge collected", "Total collected"];
        const rows: (string | number)[][] = byTicketer.map(r => [
          r.employeeName, r.trips, r.passengers, r.distanceKm.toFixed(1),
          fmtMoney(r.tariff), fmtMoney(r.totalServiceCharge), fmtMoney(r.totalCollected),
        ]);
        if (format === "csv") exportCSV(`sales-by-ticketer-${stamp}`, headers, rows);
        else exportHTML(`sales-by-ticketer-${stamp}`, "Sales — By Ticketer", `${label} · ${rows.length.toLocaleString()} ticketers`, headers, rows);
        return;
      }

      // Trips view — every matching row, not just the current page.
      const res = await apiFetch<{ data: SalesTrip[]; truncated: boolean }>(`/api/sales/trips/export?${buildFilterParams().toString()}`);
      if (res.truncated) setToast(`Export capped at ${res.data.length.toLocaleString()} rows — narrow your filters to get everything.`);

      const headers = ["Date (Gregorian)", "Date (Ethiopian E.C.)", "Departure", "Arrival", "Ticketer", "Vehicle plate", "Level", "Distance (km)", "Tariff", "Service charge/pax", "Service charge total", "Passengers"];
      const rows: (string | number)[][] = res.data.map(t => [
        fmtDateTimeMs(t.date), ethiopianDayLabel(t.date.slice(0, 10)),
        t.departureTerminalName, t.arrivalTerminalName,
        t.employee?.name ?? "—", t.vehicle?.plateNo ?? "—", t.level,
        t.distanceKm.toFixed(1), fmtMoney(t.tariff), fmtMoney(t.serviceCharge), fmtMoney(t.totalServiceCharge), t.passengers,
      ]);
      if (format === "csv") exportCSV(`sales-trips-${stamp}`, headers, rows);
      else exportHTML(`sales-trips-${stamp}`, "Sales — Trips", `${label} · ${rows.length.toLocaleString()} trips`, headers, rows);
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Export failed.");
    } finally {
      setExporting(null);
    }
  }

  const latestLog = logs[0] ?? null;
  const completenessGap = latestLog?.sourceTotal != null && latestLog?.ourTotal != null ? latestLog.sourceTotal - latestLog.ourTotal : null;

  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const totalCollected = totals.tariff + totals.totalServiceCharge;

  return (
    <>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } } * { box-sizing: border-box; }`}</style>
      {toast && <Toast message={toast} onDone={() => setToast(null)} />}

      <div style={{ minHeight: "100vh", background: "var(--background)", padding: "24px 28px" }}>

        {/* Top bar */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--foreground)", margin: 0 }}>Sales</h1>
            <p style={{ fontSize: 13, color: "var(--muted-foreground)", margin: "3px 0 0" }}>
              Mirrored from the OTA ticketing system · {total.toLocaleString()} trips on file
            </p>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {syncing && syncStatusLine && (
              <span style={{ fontSize: 12, color: "var(--muted-foreground)", maxWidth: 320, textAlign: "right" }}>{syncStatusLine}</span>
            )}
            <button onClick={() => setShowHistory(s => !s)} style={{ height: 40, padding: "0 16px", borderRadius: 10, border: "1.5px solid var(--border)", background: "var(--surface)", fontSize: 14, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 7, color: "var(--foreground)" }}>
              <History size={15} /> Sync history
            </button>
            <button onClick={handleSync} disabled={syncing} style={{ height: 40, padding: "0 18px", borderRadius: 10, border: "none", background: "var(--primary)", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 7, opacity: syncing ? 0.7 : 1 }}>
              {syncing ? <Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} /> : <RefreshCw size={15} />}
              {syncing ? "Syncing…" : "Sync now"}
            </button>
          </div>
        </div>

        {/* Live sync progress panel */}
        {syncing && (
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 14, marginBottom: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: syncProgressFrac !== null ? 8 : 0 }}>
              <Loader2 size={14} style={{ animation: "spin 1s linear infinite", color: "var(--primary)", flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)" }}>{syncStatusLine}</span>
            </div>
            {syncProgressFrac !== null && (
              <div style={{ height: 6, background: "var(--background)", borderRadius: 999, overflow: "hidden", marginBottom: 8 }}>
                <div style={{ height: "100%", width: `${Math.round(syncProgressFrac * 100)}%`, background: "var(--primary)", transition: "width 0.15s linear" }} />
              </div>
            )}
            {syncLog.length > 1 && (
              <div style={{ fontSize: 11, color: "var(--muted-foreground)", lineHeight: 1.8 }}>
                {syncLog.slice(0, -1).map((line, i) => <div key={i}>{line}</div>)}
              </div>
            )}
          </div>
        )}

        {/* Completeness banner — driven by the most recent sync's own count comparison */}
        {latestLog && completenessGap !== null && !syncing && (
          <div style={{
            display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 10, marginBottom: 14,
            background: completenessGap === 0 ? "#dcfce7" : "#fef3c7",
          }}>
            {completenessGap === 0
              ? <Check size={15} color="#16a34a" />
              : <AlertCircle size={15} color="#d97706" />}
            <span style={{ fontSize: 13, color: completenessGap === 0 ? "#16a34a" : "#d97706", fontWeight: 500 }}>
              {completenessGap === 0
                ? `Fully in sync — ${latestLog.ourTotal?.toLocaleString()} trips match the source exactly.`
                : `${completenessGap} trip${completenessGap === 1 ? "" : "s"} behind the source (${latestLog.ourTotal?.toLocaleString()} of ${latestLog.sourceTotal?.toLocaleString()}) — next sync will close the gap.`}
            </span>
          </div>
        )}

        {/* Sync history panel */}
        {showHistory && (
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 14, marginBottom: 18 }}>
            <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--muted-foreground)", marginBottom: 10 }}>Recent sync runs</p>
            {logs.length === 0 ? (
              <div style={{ padding: "12px 0", textAlign: "center", color: "var(--muted-foreground)", fontSize: 13 }}>No syncs yet — click &ldquo;Sync now&rdquo; to pull data for the first time.</div>
            ) : (
              logs.map(l => {
                const ss = statusStyle(l.status);
                return (
                  <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: "1px solid var(--border)", flexWrap: "wrap" }}>
                    <Badge label={l.source === "MANUAL" ? "Manual" : "Auto"} bg={l.source === "MANUAL" ? "#dbeafe" : "#ede9fe"} fg={l.source === "MANUAL" ? "#1d4ed8" : "#7c3aed"} />
                    <Badge label={l.status} bg={ss.bg} fg={ss.fg} />
                    <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>{fmtDateTime(l.startedAt)}</span>
                    <span style={{ fontSize: 12, color: "var(--foreground)" }}>{l.rowsFetched} fetched · {l.rowsCreated} new · {l.rowsUpdated} already known · {l.passes} pass{l.passes === 1 ? "" : "es"} · {l.pagesFetched} page{l.pagesFetched === 1 ? "" : "s"}</span>
                    {l.sourceTotal !== null && l.ourTotal !== null && (
                      <span style={{ fontSize: 12, color: l.sourceTotal === l.ourTotal ? "#16a34a" : "#d97706", fontWeight: 500 }}>
                        {l.ourTotal.toLocaleString()}/{l.sourceTotal.toLocaleString()} on file
                      </span>
                    )}
                    {l.errorMessage && <span style={{ fontSize: 12, color: "#dc2626" }}>{l.errorMessage}</span>}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Grand totals — finance/management summary for the current filtered view */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginBottom: 18 }}>
          {[
            { label: "Trips", value: total.toLocaleString(), icon: <RouteIcon size={14} /> },
            { label: "Distance", value: `${fmtMoney(totals.distanceKm)} km`, icon: <Gauge size={14} /> },
            { label: "Passengers", value: totals.passengers.toLocaleString(), icon: <UsersIcon size={14} /> },
            { label: "Tariff revenue", value: `${fmtMoney(totals.tariff)} ETB`, icon: <Wallet size={14} /> },
            { label: "Service charge collected", value: `${fmtMoney(totals.totalServiceCharge)} ETB`, icon: <Coins size={14} /> },
            { label: "Total collected", value: `${fmtMoney(totalCollected)} ETB`, icon: <Wallet size={14} />, accent: true },
          ].map(s => (
            <div key={s.label} style={{ background: s.accent ? "color-mix(in srgb, var(--primary) 8%, var(--surface))" : "var(--surface)", border: `1px solid ${s.accent ? "color-mix(in srgb, var(--primary) 30%, transparent)" : "var(--border)"}`, borderRadius: 10, padding: "12px 14px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--muted-foreground)", marginBottom: 4 }}>{s.icon} {s.label}</div>
              <div style={{ fontSize: 17, fontWeight: 700, color: s.accent ? "var(--primary)" : "var(--foreground)" }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 14, marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--muted-foreground)", margin: 0 }}>Filters</p>
            {filtersActive && (
              <button onClick={clearFilters} style={{ fontSize: 12, color: "var(--primary)", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>Clear all</button>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 12 }}>
            <Field label="Departure station">
              <select style={selCss} value={departureTerminal} onChange={e => { setDepartureTerminal(e.target.value); setOffset(0); }}>
                <option value="">All stations</option>
                {filterOptions.departureTerminals.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Arrival station (route)">
              <select style={selCss} value={arrivalTerminal} onChange={e => { setArrivalTerminal(e.target.value); setOffset(0); }}>
                <option value="">All destinations</option>
                {filterOptions.arrivalTerminals.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Ticketer">
              <select style={selCss} value={employeeId} onChange={e => { setEmployeeId(e.target.value); setOffset(0); }}>
                <option value="">All ticketers</option>
                {filterOptions.employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
              </select>
            </Field>
            <Field label="Plate number">
              <input placeholder="e.g. 87094" style={iCss} value={plateNo} onChange={e => { setPlateNo(e.target.value); setOffset(0); }} />
            </Field>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <Field label="Date from — Gregorian">
              <input type="date" style={iCss} value={dateFrom} onChange={e => { setDateFrom(e.target.value); setOffset(0); }} />
            </Field>
            <Field label="Date to — Gregorian">
              <input type="date" style={iCss} value={dateTo} onChange={e => { setDateTo(e.target.value); setOffset(0); }} />
            </Field>
            <Field label="Date from — Ethiopian (E.C.)">
              <EthiopianDateInput value={dateFrom} onChange={v => { setDateFrom(v); setOffset(0); }} />
            </Field>
            <Field label="Date to — Ethiopian (E.C.)">
              <EthiopianDateInput value={dateTo} onChange={v => { setDateTo(v); setOffset(0); }} />
            </Field>
          </div>

          <Field label="Search (employee, station, plate)">
            <input placeholder="Free-text search across employee, station and plate…" style={iCss} value={search} onChange={e => { setSearch(e.target.value); setOffset(0); }} />
          </Field>
        </div>

        {error && (
          <div style={{ display: "flex", gap: 8, padding: "10px 12px", background: "#fee2e2", borderRadius: 8, marginBottom: 14 }}>
            <AlertCircle size={15} color="#dc2626" style={{ flexShrink: 0, marginTop: 1 }} />
            <span style={{ fontSize: 13, color: "#dc2626" }}>{error}</span>
          </div>
        )}

        {/* View toggle + export */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
          <div style={{ display: "flex", gap: 2, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 3, width: "fit-content" }}>
            {([["trips", "Trips"], ["by-ticketer", "By ticketer"]] as const).map(([id, label]) => {
              const active = view === id;
              return (
                <button key={id} onClick={() => setView(id)} style={{
                  height: 34, padding: "0 16px", borderRadius: 7, border: "none",
                  background: active ? "var(--primary)" : "transparent",
                  color: active ? "#fff" : "var(--muted-foreground)",
                  fontSize: 13, fontWeight: active ? 700 : 500, cursor: "pointer",
                }}>
                  {label}
                </button>
              );
            })}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
              Export {filtersActive ? "filtered data" : "everything"}:
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => handleExport("csv")} disabled={exporting !== null} style={{ height: 34, padding: "0 14px", borderRadius: 8, border: "1.5px solid var(--border)", background: "var(--surface)", fontSize: 12, fontWeight: 600, cursor: exporting ? "default" : "pointer", opacity: exporting && exporting !== "csv" ? 0.5 : 1, display: "flex", alignItems: "center", gap: 6, color: "#16a34a" }}>
                {exporting === "csv" ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <FileSpreadsheet size={14} />}
                Excel / CSV
              </button>
              <button onClick={() => handleExport("pdf")} disabled={exporting !== null} style={{ height: 34, padding: "0 14px", borderRadius: 8, border: "1.5px solid var(--border)", background: "var(--surface)", fontSize: 12, fontWeight: 600, cursor: exporting ? "default" : "pointer", opacity: exporting && exporting !== "pdf" ? 0.5 : 1, display: "flex", alignItems: "center", gap: 6, color: "#dc2626" }}>
                {exporting === "pdf" ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Printer size={14} />}
                PDF / Print
              </button>
            </div>
          </div>
        </div>

        {/* By-ticketer earnings table */}
        {view === "by-ticketer" && (
          byTicketerLoading ? (
            <div style={{ padding: 40, textAlign: "center", color: "var(--muted-foreground)", fontSize: 13 }}>Loading ticketer earnings…</div>
          ) : byTicketer.length === 0 ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "60px 0", color: "var(--muted-foreground)" }}>
              <UsersIcon size={36} style={{ marginBottom: 12, opacity: 0.25 }} />
              <p style={{ fontSize: 14 }}>No ticketer earnings match these filters.</p>
            </div>
          ) : (
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", marginBottom: 18 }}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "var(--background)", borderBottom: "1px solid var(--border)" }}>
                      {["", "#", "Ticketer", "Trips", "Passengers", "Distance", "Tariff", "Service charge collected", "Total collected"].map(h => (
                        <th key={h} style={{ textAlign: "left", padding: "10px 14px", fontSize: 11, fontWeight: 700, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {byTicketer.map((r, i) => {
                      const expanded = expandedTicketer === r.employeeId;
                      return (
                        <Fragment key={r.employeeId}>
                          <tr onClick={() => toggleTicketer(r.employeeId)} style={{ borderBottom: "1px solid var(--border)", cursor: "pointer", background: expanded ? "color-mix(in srgb, var(--primary) 5%, transparent)" : undefined }}>
                            <td style={{ padding: "10px 0 10px 14px", width: 20 }}>
                              <ChevronDown size={14} color="var(--muted-foreground)" style={{ transform: expanded ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.15s" }} />
                            </td>
                            <td style={{ padding: "10px 14px", color: "var(--muted-foreground)", fontFamily: "monospace" }}>{i + 1}</td>
                            <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                <User size={12} color="var(--muted-foreground)" />
                                <span style={{ color: "var(--foreground)", fontWeight: 600 }}>{r.employeeName}</span>
                              </div>
                            </td>
                            <td style={{ padding: "10px 14px", color: "var(--foreground)" }}>{r.trips.toLocaleString()}</td>
                            <td style={{ padding: "10px 14px", color: "var(--foreground)" }}>{r.passengers.toLocaleString()}</td>
                            <td style={{ padding: "10px 14px", color: "var(--foreground)", fontFamily: "monospace" }}>{fmtMoney(r.distanceKm)} km</td>
                            <td style={{ padding: "10px 14px", color: "var(--foreground)", fontFamily: "monospace" }}>{fmtMoney(r.tariff)}</td>
                            <td style={{ padding: "10px 14px", color: "var(--foreground)", fontFamily: "monospace" }}>{fmtMoney(r.totalServiceCharge)}</td>
                            <td style={{ padding: "10px 14px", color: "var(--primary)", fontFamily: "monospace", fontWeight: 700 }}>{fmtMoney(r.totalCollected)}</td>
                          </tr>
                          {expanded && (
                            <tr>
                              <td colSpan={9} style={{ padding: 0, background: "var(--background)", borderBottom: "1px solid var(--border)" }}>
                                <div style={{ padding: 16 }}>
                                  {/* Route / Date sub-toggle */}
                                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                                    <p style={{ fontSize: 12, fontWeight: 700, color: "var(--foreground)", margin: 0 }}>{r.employeeName} — detailed breakdown</p>
                                    <div style={{ display: "flex", gap: 2, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: 2 }}>
                                      {([["date", "By date"], ["route", "By route"]] as const).map(([id, label]) => (
                                        <button key={id} onClick={() => setTicketerDetailView(id)} style={{
                                          height: 28, padding: "0 12px", borderRadius: 6, border: "none",
                                          background: ticketerDetailView === id ? "var(--primary)" : "transparent",
                                          color: ticketerDetailView === id ? "#fff" : "var(--muted-foreground)",
                                          fontSize: 12, fontWeight: 600, cursor: "pointer",
                                        }}>
                                          {label}
                                        </button>
                                      ))}
                                    </div>
                                  </div>

                                  {/* Sum for whatever date range / filters are currently active */}
                                  {!ticketerBreakdownLoading && ticketerBreakdown.length > 0 && (
                                    <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center", padding: "10px 14px", borderRadius: 8, background: "color-mix(in srgb, var(--primary) 6%, transparent)", border: "1px solid color-mix(in srgb, var(--primary) 20%, transparent)", marginBottom: 12 }}>
                                      <span style={{ fontSize: 11, fontWeight: 700, color: "var(--primary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                                        {dateFrom || dateTo ? `${dateFrom ? fmtDay(dateFrom) : "Start"} → ${dateTo ? fmtDay(dateTo) : "Now"}` : "All time"}
                                      </span>
                                      <span style={{ fontSize: 12, color: "var(--foreground)" }}>{ticketerFilteredSummary.trips.toLocaleString()} trips</span>
                                      <span style={{ fontSize: 12, color: "var(--foreground)" }}>{ticketerFilteredSummary.passengers.toLocaleString()} passengers</span>
                                      <span style={{ fontSize: 12, color: "var(--foreground)" }}>{fmtMoney(ticketerFilteredSummary.tariff)} tariff</span>
                                      <span style={{ fontSize: 12, color: "var(--foreground)" }}>{fmtMoney(ticketerFilteredSummary.totalServiceCharge)} service charge</span>
                                      <span style={{ fontSize: 13, color: "var(--primary)", fontWeight: 700, marginLeft: "auto" }}>{fmtMoney(ticketerFilteredSummary.totalCollected)} total collected</span>
                                    </div>
                                  )}

                                  {ticketerBreakdownLoading ? (
                                    <div style={{ padding: "20px 0", textAlign: "center", color: "var(--muted-foreground)", fontSize: 12 }}>Loading breakdown…</div>
                                  ) : ticketerBreakdown.length === 0 ? (
                                    <div style={{ padding: "20px 0", textAlign: "center", color: "var(--muted-foreground)", fontSize: 12 }}>No trips for this ticketer under the current filters.</div>
                                  ) : ticketerDetailView === "route" ? (
                                    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
                                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                                        <thead>
                                          <tr style={{ borderBottom: "1px solid var(--border)" }}>
                                            {["Route", "Trips", "Passengers", "Distance", "Tariff", "Service charge", "Total collected"].map(h => (
                                              <th key={h} style={{ textAlign: "left", padding: "8px 12px", fontSize: 10, fontWeight: 700, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>{h}</th>
                                            ))}
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {ticketerByRoute.map(row => (
                                            <tr key={`${row.departure}→${row.arrival}`} style={{ borderBottom: "1px solid var(--border)" }}>
                                              <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>
                                                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                                  <RouteIcon size={11} color="var(--muted-foreground)" />
                                                  <span style={{ color: "var(--foreground)" }}>{row.departure} → {row.arrival}</span>
                                                </div>
                                              </td>
                                              <td style={{ padding: "8px 12px", color: "var(--foreground)" }}>{row.trips.toLocaleString()}</td>
                                              <td style={{ padding: "8px 12px", color: "var(--foreground)" }}>{row.passengers.toLocaleString()}</td>
                                              <td style={{ padding: "8px 12px", color: "var(--foreground)", fontFamily: "monospace" }}>{fmtMoney(row.distanceKm)} km</td>
                                              <td style={{ padding: "8px 12px", color: "var(--foreground)", fontFamily: "monospace" }}>{fmtMoney(row.tariff)}</td>
                                              <td style={{ padding: "8px 12px", color: "var(--foreground)", fontFamily: "monospace" }}>{fmtMoney(row.totalServiceCharge)}</td>
                                              <td style={{ padding: "8px 12px", color: "var(--primary)", fontFamily: "monospace", fontWeight: 700 }}>{fmtMoney(row.totalCollected)}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  ) : (
                                    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
                                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                                        <thead>
                                          <tr style={{ borderBottom: "1px solid var(--border)" }}>
                                            {["", "Date", "Trips", "Passengers", "Distance", "Tariff", "Service charge", "Total collected"].map(h => (
                                              <th key={h} style={{ textAlign: "left", padding: "8px 12px", fontSize: 10, fontWeight: 700, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>{h}</th>
                                            ))}
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {ticketerByDate.map(row => {
                                            const dateExpanded = expandedDate === row.date;
                                            const routesForDate = ticketerBreakdown.filter(b => b.date === row.date);
                                            return (
                                              <Fragment key={row.date}>
                                                <tr onClick={() => setExpandedDate(dateExpanded ? null : row.date)} style={{ borderBottom: "1px solid var(--border)", cursor: "pointer", background: dateExpanded ? "color-mix(in srgb, var(--primary) 5%, transparent)" : undefined }}>
                                                  <td style={{ padding: "8px 0 8px 12px", width: 18 }}>
                                                    <ChevronDown size={12} color="var(--muted-foreground)" style={{ transform: dateExpanded ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.15s" }} />
                                                  </td>
                                                  <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>
                                                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                                      <Calendar size={11} color="var(--muted-foreground)" />
                                                      <div>
                                                        <div style={{ color: "var(--foreground)" }}>{fmtDay(row.date)}</div>
                                                        <div style={{ color: "var(--muted-foreground)", fontSize: 10 }}>{ethiopianDayLabel(row.date)}</div>
                                                      </div>
                                                    </div>
                                                  </td>
                                                  <td style={{ padding: "8px 12px", color: "var(--foreground)" }}>{row.trips.toLocaleString()}</td>
                                                  <td style={{ padding: "8px 12px", color: "var(--foreground)" }}>{row.passengers.toLocaleString()}</td>
                                                  <td style={{ padding: "8px 12px", color: "var(--foreground)", fontFamily: "monospace" }}>{fmtMoney(row.distanceKm)} km</td>
                                                  <td style={{ padding: "8px 12px", color: "var(--foreground)", fontFamily: "monospace" }}>{fmtMoney(row.tariff)}</td>
                                                  <td style={{ padding: "8px 12px", color: "var(--foreground)", fontFamily: "monospace" }}>{fmtMoney(row.totalServiceCharge)}</td>
                                                  <td style={{ padding: "8px 12px", color: "var(--primary)", fontFamily: "monospace", fontWeight: 700 }}>{fmtMoney(row.totalCollected)}</td>
                                                </tr>
                                                {dateExpanded && (
                                                  <tr>
                                                    <td colSpan={8} style={{ padding: "6px 12px 12px 34px", background: "var(--background)", borderBottom: "1px solid var(--border)" }}>
                                                      <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>
                                                        Routes worked on {fmtDay(row.date)}
                                                      </div>
                                                      {routesForDate.map(rt => (
                                                        <div key={`${rt.date}-${rt.departureTerminalName}-${rt.arrivalTerminalName}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: "1px solid var(--border)", fontSize: 12 }}>
                                                          <span style={{ display: "flex", alignItems: "center", gap: 5, color: "var(--foreground)" }}>
                                                            <RouteIcon size={11} color="var(--muted-foreground)" /> {rt.departureTerminalName} → {rt.arrivalTerminalName}
                                                          </span>
                                                          <span style={{ color: "var(--muted-foreground)" }}>{rt.trips} trip{rt.trips === 1 ? "" : "s"} · {rt.passengers} pax</span>
                                                          <span style={{ fontFamily: "monospace", fontWeight: 700, color: "var(--primary)" }}>{fmtMoney(rt.totalCollected)}</span>
                                                        </div>
                                                      ))}
                                                    </td>
                                                  </tr>
                                                )}
                                              </Fragment>
                                            );
                                          })}
                                        </tbody>
                                      </table>
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )
        )}

        {/* Trips table */}
        {view === "trips" && (loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--muted-foreground)", fontSize: 13 }}>Loading trips…</div>
        ) : trips.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "60px 0", color: "var(--muted-foreground)" }}>
            <TrendingUp size={36} style={{ marginBottom: 12, opacity: 0.25 }} />
            <p style={{ fontSize: 14 }}>No trips match these filters.</p>
            <p style={{ fontSize: 12, marginTop: 4 }}>{total === 0 ? <>Click &ldquo;Sync now&rdquo; to pull data from the OTA system.</> : <>Try clearing a filter.</>}</p>
          </div>
        ) : (
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "var(--background)", borderBottom: "1px solid var(--border)" }}>
                    {["Date & time (newest first)", "Route", "Ticketer", "Vehicle", "Level", "Distance", "Tariff", "Service charge", "Pax"].map(h => (
                      <th key={h} style={{ textAlign: "left", padding: "10px 14px", fontSize: 11, fontWeight: 700, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {trips.map(t => (
                    <tr key={t.id} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "10px 14px", whiteSpace: "nowrap", color: "var(--foreground)", fontFamily: "monospace", fontSize: 12 }}>
                        {fmtDateTimeMs(t.date)}
                        <div style={{ fontSize: 11, color: "var(--muted-foreground)", fontFamily: "inherit" }}>{formatEthiopianDate(dateToEthiopian(new Date(t.date)))} E.C.</div>
                      </td>
                      <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                          <MapPin size={12} color="var(--muted-foreground)" />
                          <span style={{ color: "var(--foreground)" }}>{t.departureTerminalName} → {t.arrivalTerminalName}</span>
                        </div>
                      </td>
                      <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                          <User size={12} color="var(--muted-foreground)" />
                          <span style={{ color: "var(--foreground)" }}>{t.employee?.name ?? "—"}</span>
                        </div>
                      </td>
                      <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                          <Truck size={12} color="var(--muted-foreground)" />
                          <span style={{ color: "var(--foreground)", fontFamily: "monospace" }}>{t.vehicle?.plateNo ?? "—"}</span>
                        </div>
                      </td>
                      <td style={{ padding: "10px 14px", color: "var(--muted-foreground)" }}>{t.level}</td>
                      <td style={{ padding: "10px 14px", color: "var(--foreground)", fontFamily: "monospace" }}>{fmtMoney(t.distanceKm)} km</td>
                      <td style={{ padding: "10px 14px", color: "var(--foreground)", fontFamily: "monospace", fontWeight: 600 }}>{fmtMoney(t.tariff)}</td>
                      <td style={{ padding: "10px 14px", fontFamily: "monospace" }}>
                        <div style={{ color: "var(--muted-foreground)", fontSize: 11 }}>{fmtMoney(t.serviceCharge)}/pax</div>
                        <div style={{ color: "var(--foreground)", fontWeight: 700 }}>{fmtMoney(t.totalServiceCharge)}</div>
                      </td>
                      <td style={{ padding: "10px 14px", color: "var(--foreground)" }}>{t.passengers}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderTop: "1px solid var(--border)" }}>
              <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>Page {page} of {pages} · {total.toLocaleString()} trips</span>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => setOffset(o => Math.max(0, o - PAGE_SIZE))} disabled={offset === 0} style={{ width: 32, height: 32, borderRadius: 8, border: "1.5px solid var(--border)", background: "var(--surface)", cursor: offset === 0 ? "default" : "pointer", opacity: offset === 0 ? 0.4 : 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <ChevronLeft size={14} />
                </button>
                <button onClick={() => setOffset(o => o + PAGE_SIZE)} disabled={offset + PAGE_SIZE >= total} style={{ width: 32, height: 32, borderRadius: 8, border: "1.5px solid var(--border)", background: "var(--surface)", cursor: offset + PAGE_SIZE >= total ? "default" : "pointer", opacity: offset + PAGE_SIZE >= total ? 0.4 : 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
