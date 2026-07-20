"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import {
  Truck, RefreshCw, Loader2, AlertCircle, Check, History,
  ChevronDown, ChevronLeft, ChevronRight, FileSpreadsheet, Printer, Info,
} from "lucide-react";
import { exportCSV, exportHTML } from "@/lib/export";
import InfoTip from "@/components/InfoTip";

type OtaVehicleRow = {
  id: string;
  plateNumber: string | null;
  plateRegion: string | null;
  seatCapacity: number | null;
  status: string | null;
  isAssignedToRoute: boolean | null;
  driverName: string | null;
  driverLicenceNumber: string | null;
  fleetTypeName: string | null;
  associationName: string | null;
  assignedTerminalId: string | null;
  assignedTerminalName: string | null;
  vehicleLevelName: string | null;
  departureTerminalName: string | null;
  arrivalTerminalName: string | null;
  routeDistanceKm: number | null;
  usedInTrips: boolean;
  raw: unknown;
  firstSeenAt: string;
  updatedAt: string;
};

type FilterOptions = {
  associations: string[];
  fleetTypes: string[];
  departureTerminals: string[];
  arrivalTerminals: string[];
};

type SyncStatus = "SUCCESS" | "FAILED" | "PARTIAL" | "SKIPPED" | "RATE_LIMITED";

type SyncLogRow = {
  id: string;
  status: SyncStatus;
  rowsFetched: number;
  rowsCreated: number;
  rowsUpdated: number;
  sourceTotal: number | null;
  ourTotal: number | null;
  errorMessage: string | null;
  startedAt: string;
  finishedAt: string | null;
};

type SyncApiResult = { status: SyncStatus; rowsCreated: number; rowsUpdated: number; sourceTotal: number | null; errorMessage: string | null };

type ProgressEvent =
  | { type: "start" }
  | { type: "page"; page: number; pages: number; rowsSoFar: number }
  | { type: "upserting"; done: number; total: number }
  | { type: "skipped"; reason: string }
  | { type: "rate-limited"; retryAfterSeconds: number }
  | { type: "done" };

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { headers: { "Content-Type": "application/json" }, ...init });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.message ?? json?.error ?? `Request failed: ${res.status}`);
  return json as T;
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function statusStyle(s: SyncStatus): { bg: string; fg: string } {
  if (s === "SUCCESS") return { bg: "#dcfce7", fg: "#16a34a" };
  if (s === "PARTIAL") return { bg: "#fef3c7", fg: "#d97706" };
  if (s === "SKIPPED") return { bg: "#f1f5f9", fg: "#64748b" };
  if (s === "RATE_LIMITED") return { bg: "#ede9fe", fg: "#7c3aed" };
  return { bg: "#fee2e2", fg: "#dc2626" };
}
function progressLine(e: ProgressEvent): string {
  switch (e.type) {
    case "start": return "Fetching vehicles from OTA — this is a large table, expect a couple of minutes…";
    case "page": return `Page ${e.page}/${e.pages} — ${e.rowsSoFar.toLocaleString()} rows fetched`;
    case "upserting": return `Saving ${e.done.toLocaleString()}/${e.total.toLocaleString()}…`;
    case "skipped": return e.reason;
    case "rate-limited": return `Rate limited by the source — cooling down for about ${Math.round(e.retryAfterSeconds / 60)} min.`;
    case "done": return "Done.";
  }
}

const iCss: React.CSSProperties = {
  height: 38, padding: "0 12px", border: "1.5px solid var(--border)", borderRadius: 9,
  background: "var(--surface)", color: "var(--foreground)", fontSize: 13, outline: "none",
};

function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useState(() => { const t = setTimeout(onDone, 3200); return () => clearTimeout(t); });
  return (
    <div style={{ position: "fixed", bottom: 28, right: 28, zIndex: 9999, background: "#0f172a", color: "#fff", padding: "12px 20px", borderRadius: 12, fontSize: 14, fontWeight: 500, display: "flex", alignItems: "center", gap: 8, boxShadow: "0 8px 30px rgb(0 0 0 / 0.18)", maxWidth: 420 }}>
      <Check size={15} strokeWidth={2.5} color="#4ade80" style={{ flexShrink: 0 }} />{message}
    </div>
  );
}

const PAGE_SIZE = 50;

export default function OtaVehiclesPage() {
  const [rows, setRows] = useState<OtaVehicleRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [status, setStatus] = useState("");
  const [association, setAssociation] = useState("");
  const [departureTerminal, setDepartureTerminal] = useState("");
  const [arrivalTerminal, setArrivalTerminal] = useState("");
  const [usedInTrips, setUsedInTrips] = useState(false);
  const [search, setSearch] = useState("");
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({ associations: [], fleetTypes: [], departureTerminals: [], arrivalTerminals: [] });

  const [expanded, setExpanded] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncStatusLine, setSyncStatusLine] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [exporting, setExporting] = useState<"csv" | "pdf" | null>(null);

  const [logs, setLogs] = useState<SyncLogRow[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const buildParams = useCallback(() => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (association) params.set("association", association);
    if (departureTerminal) params.set("departureTerminal", departureTerminal);
    if (arrivalTerminal) params.set("arrivalTerminal", arrivalTerminal);
    if (usedInTrips) params.set("usedInTrips", "true");
    if (search) params.set("search", search);
    return params;
  }, [status, association, departureTerminal, arrivalTerminal, usedInTrips, search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = buildParams();
      params.set("offset", String(offset));
      params.set("limit", String(PAGE_SIZE));
      const res = await apiFetch<{ data: OtaVehicleRow[]; meta: { total: number } }>(`/api/ota/vehicles?${params.toString()}`);
      setRows(res.data);
      setTotal(res.meta.total);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load vehicles.");
    } finally {
      setLoading(false);
    }
  }, [offset, buildParams]);

  const loadLogs = useCallback(async () => {
    try {
      const res = await apiFetch<{ data: SyncLogRow[] }>("/api/ota/vehicles/sync?limit=10");
      setLogs(res.data);
    } catch {
      // sync history is a secondary panel
    }
  }, []);

  const loadFilterOptions = useCallback(async () => {
    try {
      const res = await apiFetch<FilterOptions>("/api/ota/vehicles/filter-options");
      setFilterOptions(res);
    } catch {
      // dropdowns just stay empty — the free-text search still works
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadLogs(); }, [loadLogs]);
  useEffect(() => { loadFilterOptions(); }, [loadFilterOptions]);

  async function handleSync() {
    setSyncing(true);
    setSyncStatusLine("Starting sync…");
    try {
      const res = await fetch("/api/ota/vehicles/sync?stream=1", { method: "POST" });
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
            | { kind: "progress"; event: ProgressEvent }
            | { kind: "done"; result: SyncApiResult }
            | { kind: "error"; message: string };
          if (payload.kind === "progress") setSyncStatusLine(progressLine(payload.event));
          else if (payload.kind === "done") finalResult = payload.result;
          else if (payload.kind === "error") streamError = payload.message;
        }
      }

      if (streamError) throw new Error(streamError);
      if (finalResult) {
        if (finalResult.status === "SKIPPED") setToast(finalResult.errorMessage ?? "Already up to date.");
        else if (finalResult.status === "RATE_LIMITED") setToast("Rate limited by the source — try again shortly.");
        else setToast(`Synced: ${finalResult.rowsCreated} new, ${finalResult.rowsUpdated} updated${finalResult.sourceTotal != null ? ` (${finalResult.sourceTotal.toLocaleString()} on source)` : ""}.`);
      }

      setOffset(0);
      await Promise.all([load(), loadLogs()]);
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(false);
      setSyncStatusLine(null);
    }
  }

  async function handleExport(format: "csv" | "pdf") {
    setExporting(format);
    try {
      const headers = ["Plate", "Region", "Seats", "Status", "On route", "Fleet type", "Association", "Vehicle level", "Departure", "Arrival", "Distance (km)", "Assigned terminal", "Driver", "Licence no.", "Used in your trips"];
      const exportRows: (string | number)[][] = rows.map(v => [
        v.plateNumber ?? "—", v.plateRegion ?? "—", v.seatCapacity ?? "—", v.status ?? "—",
        v.isAssignedToRoute ? "Yes" : "No", v.fleetTypeName ?? "—", v.associationName ?? "—",
        v.vehicleLevelName ?? "—", v.departureTerminalName ?? "—", v.arrivalTerminalName ?? "—", v.routeDistanceKm ?? "—",
        v.assignedTerminalName ?? "—", v.driverName ?? "—", v.driverLicenceNumber ?? "—", v.usedInTrips ? "Yes" : "No",
      ]);
      const stamp = new Date().toISOString().slice(0, 10);
      if (format === "csv") exportCSV(`ota-vehicles-${stamp}`, headers, exportRows);
      else exportHTML(`ota-vehicles-${stamp}`, "OTA Vehicles", `${exportRows.length.toLocaleString()} rows (current page)`, headers, exportRows);
    } finally {
      setExporting(null);
    }
  }

  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } } * { box-sizing: border-box; }`}</style>
      {toast && <Toast message={toast} onDone={() => setToast(null)} />}

      <div className="page-pad" style={{ minHeight: "100vh", background: "var(--background)", padding: "24px 28px" }}>

        {/* Top bar */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--foreground)", margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
              <Truck size={22} /> OTA Vehicles
            </h1>
            <p style={{ fontSize: 13, color: "var(--muted-foreground)", margin: "3px 0 0", display: "flex", alignItems: "center", gap: 5 }}>
              Mirrored from OTA&apos;s nationwide vehicle fleet · {total.toLocaleString()} on file
              <InfoTip text="This is OTA's entire vehicle fleet across every operator on the platform (~19.8k vehicles as of the last sync), not just this company's own fleet — OTA's API doesn't scope this endpoint by company. The first sync takes a couple of minutes." size={12} />
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

        {showHistory && (
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 14, marginBottom: 18 }}>
            <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--muted-foreground)", marginBottom: 10 }}>Recent sync runs</p>
            {logs.length === 0 ? (
              <div style={{ padding: "12px 0", textAlign: "center", color: "var(--muted-foreground)", fontSize: 13 }}>No syncs yet — click &ldquo;Sync now&rdquo; to pull data for the first time.</div>
            ) : logs.map(l => {
              const ss = statusStyle(l.status);
              return (
                <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: "1px solid var(--border)", flexWrap: "wrap" }}>
                  <span style={{ display: "inline-flex", padding: "2px 10px", borderRadius: 999, fontSize: 11, fontWeight: 600, background: ss.bg, color: ss.fg }}>{l.status}</span>
                  <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>{fmtDateTime(l.startedAt)}</span>
                  <span style={{ fontSize: 12, color: "var(--foreground)" }}>{l.rowsFetched} fetched · {l.rowsCreated} new · {l.rowsUpdated} updated</span>
                  {l.sourceTotal !== null && l.ourTotal !== null && (
                    <span style={{ fontSize: 12, color: l.sourceTotal === l.ourTotal ? "#16a34a" : "#d97706", fontWeight: 500 }}>{l.ourTotal.toLocaleString()}/{l.sourceTotal.toLocaleString()} on file</span>
                  )}
                  {l.errorMessage && <span style={{ fontSize: 12, color: "#dc2626" }}>{l.errorMessage}</span>}
                </div>
              );
            })}
          </div>
        )}

        {/* Filters */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 14, marginBottom: 14, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--muted-foreground)", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.05em" }}>Status</label>
              <select style={{ ...iCss, cursor: "pointer" }} value={status} onChange={e => { setStatus(e.target.value); setOffset(0); }}>
                <option value="">All</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
            <div>
              <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600, color: "var(--muted-foreground)", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Association
                <InfoTip text="OTA vehicles belong to an association, not a company directly — this is the closest first-class grouping the source data has." size={11} />
              </label>
              <select style={{ ...iCss, cursor: "pointer", maxWidth: 200 }} value={association} onChange={e => { setAssociation(e.target.value); setOffset(0); }}>
                <option value="">All</option>
                {filterOptions.associations.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--muted-foreground)", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.05em" }}>Departure</label>
              <select style={{ ...iCss, cursor: "pointer", maxWidth: 180 }} value={departureTerminal} onChange={e => { setDepartureTerminal(e.target.value); setOffset(0); }}>
                <option value="">All</option>
                {filterOptions.departureTerminals.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--muted-foreground)", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.05em" }}>Arrival</label>
              <select style={{ ...iCss, cursor: "pointer", maxWidth: 180 }} value={arrivalTerminal} onChange={e => { setArrivalTerminal(e.target.value); setOffset(0); }}>
                <option value="">All</option>
                {filterOptions.arrivalTerminals.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 6, height: 38, fontSize: 13, color: "var(--foreground)", cursor: "pointer" }}>
              <input type="checkbox" checked={usedInTrips} onChange={e => { setUsedInTrips(e.target.checked); setOffset(0); }} style={{ width: 16, height: 16, cursor: "pointer" }} />
              Used in your trips
              <InfoTip text="Vehicles that appear in your synced Sales trips — the closest thing to 'this company's own fleet' available, since OTA vehicles aren't directly tied to a company." size={11} />
            </label>
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--muted-foreground)", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.05em" }}>Search</label>
              <input placeholder="Plate number, driver name, licence no…" style={iCss} value={search} onChange={e => { setSearch(e.target.value); setOffset(0); }} />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => handleExport("csv")} disabled={exporting !== null} style={{ height: 38, padding: "0 14px", borderRadius: 9, border: "1.5px solid var(--border)", background: "var(--surface)", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, color: "#16a34a" }}>
                {exporting === "csv" ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <FileSpreadsheet size={14} />} CSV
              </button>
              <button onClick={() => handleExport("pdf")} disabled={exporting !== null} style={{ height: 38, padding: "0 14px", borderRadius: 9, border: "1.5px solid var(--border)", background: "var(--surface)", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, color: "#dc2626" }}>
                {exporting === "pdf" ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Printer size={14} />} PDF
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div style={{ display: "flex", gap: 8, padding: "10px 12px", background: "#fee2e2", borderRadius: 8, marginBottom: 14 }}>
            <AlertCircle size={15} color="#dc2626" style={{ flexShrink: 0, marginTop: 1 }} />
            <span style={{ fontSize: 13, color: "#dc2626" }}>{error}</span>
          </div>
        )}

        {/* Table */}
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--muted-foreground)", fontSize: 13 }}>Loading…</div>
        ) : rows.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "60px 0", color: "var(--muted-foreground)" }}>
            <Truck size={36} style={{ marginBottom: 12, opacity: 0.25 }} />
            <p style={{ fontSize: 14 }}>No vehicles on file yet.</p>
            <p style={{ fontSize: 12, marginTop: 4 }}>Click &ldquo;Sync now&rdquo; to pull the fleet from OTA (this is a large table — expect a couple of minutes).</p>
          </div>
        ) : (
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "var(--background)", borderBottom: "1px solid var(--border)" }}>
                    {["", "Plate", "Status", "Association", "Route", "Assigned terminal", "Driver", "Your trips"].map(h => (
                      <th key={h} style={{ textAlign: "left", padding: "10px 14px", fontSize: 11, fontWeight: 700, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(v => {
                    const isExpanded = expanded === v.id;
                    return (
                      <Fragment key={v.id}>
                        <tr onClick={() => setExpanded(isExpanded ? null : v.id)} style={{ borderBottom: "1px solid var(--border)", cursor: "pointer", background: isExpanded ? "color-mix(in srgb, var(--primary) 5%, transparent)" : undefined }}>
                          <td style={{ padding: "10px 0 10px 14px", width: 20 }}>
                            <ChevronDown size={14} color="var(--muted-foreground)" style={{ transform: isExpanded ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.15s" }} />
                          </td>
                          <td style={{ padding: "10px 14px", fontWeight: 600, color: "var(--foreground)", fontFamily: "monospace", whiteSpace: "nowrap" }}>
                            {v.plateNumber ?? "—"}{v.plateRegion ? <span style={{ color: "var(--muted-foreground)", fontWeight: 400 }}> · {v.plateRegion}</span> : null}
                          </td>
                          <td style={{ padding: "10px 14px" }}>
                            <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: v.status === "active" ? "#dcfce7" : "#f1f5f9", color: v.status === "active" ? "#16a34a" : "#64748b", textTransform: "capitalize" }}>{v.status ?? "—"}</span>
                          </td>
                          <td style={{ padding: "10px 14px", color: "var(--muted-foreground)", whiteSpace: "nowrap" }}>{v.associationName ?? "—"}</td>
                          <td style={{ padding: "10px 14px", color: "var(--foreground)", whiteSpace: "nowrap" }}>
                            {v.departureTerminalName && v.arrivalTerminalName ? (
                              <>
                                {v.departureTerminalName} → {v.arrivalTerminalName}
                                {v.routeDistanceKm != null && <span style={{ color: "var(--muted-foreground)" }}> ({v.routeDistanceKm.toFixed(0)} km)</span>}
                              </>
                            ) : "—"}
                          </td>
                          <td style={{ padding: "10px 14px", color: "var(--muted-foreground)", whiteSpace: "nowrap" }}>{v.assignedTerminalName ?? "—"}</td>
                          <td style={{ padding: "10px 14px", color: "var(--muted-foreground)", whiteSpace: "nowrap" }}>{v.driverName ?? "—"}</td>
                          <td style={{ padding: "10px 14px" }}>
                            {v.usedInTrips
                              ? <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "#dcfce7", color: "#16a34a" }}>Yes</span>
                              : <span style={{ color: "var(--muted-foreground)" }}>—</span>}
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr>
                            <td colSpan={8} style={{ padding: 0, background: "var(--background)", borderBottom: "1px solid var(--border)" }}>
                              <div style={{ padding: 16 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 700, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>
                                  <Info size={12} /> Full payload from OTA
                                </div>
                                <pre style={{ margin: 0, fontSize: 11, lineHeight: 1.6, color: "var(--foreground)", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: 12, overflowX: "auto", maxHeight: 360, overflowY: "auto" }}>
                                  {JSON.stringify(v.raw, null, 2)}
                                </pre>
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

            {/* Pagination */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderTop: "1px solid var(--border)" }}>
              <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>Page {page} of {pages} · {total.toLocaleString()} vehicles</span>
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
        )}
      </div>
    </>
  );
}
