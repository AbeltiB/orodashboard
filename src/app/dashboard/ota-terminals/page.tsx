"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import {
  Landmark, RefreshCw, Loader2, AlertCircle, Check, History,
  ChevronDown, ChevronLeft, ChevronRight, FileSpreadsheet, Printer, Info,
} from "lucide-react";
import { exportCSV, exportHTML } from "@/lib/export";
import InfoTip from "@/components/InfoTip";

type OtaTerminalRow = {
  id: string;
  name: string;
  address: string | null;
  status: string | null;
  zoneName: string | null;
  woredaName: string | null;
  cityName: string | null;
  companyNames: string | null;
  raw: unknown;
  firstSeenAt: string;
  updatedAt: string;
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
    case "start": return "Fetching terminals from OTA…";
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

export default function OtaTerminalsPage() {
  const [rows, setRows] = useState<OtaTerminalRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [status, setStatus] = useState("");
  const [company, setCompany] = useState("");
  const [search, setSearch] = useState("");

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
    if (company) params.set("company", company);
    if (search) params.set("search", search);
    return params;
  }, [status, company, search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = buildParams();
      params.set("offset", String(offset));
      params.set("limit", String(PAGE_SIZE));
      const res = await apiFetch<{ data: OtaTerminalRow[]; meta: { total: number } }>(`/api/ota/terminals?${params.toString()}`);
      setRows(res.data);
      setTotal(res.meta.total);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load terminals.");
    } finally {
      setLoading(false);
    }
  }, [offset, buildParams]);

  const loadLogs = useCallback(async () => {
    try {
      const res = await apiFetch<{ data: SyncLogRow[] }>("/api/ota/terminals/sync?limit=10");
      setLogs(res.data);
    } catch {
      // sync history is a secondary panel
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadLogs(); }, [loadLogs]);

  async function handleSync() {
    setSyncing(true);
    setSyncStatusLine("Starting sync…");
    try {
      const res = await fetch("/api/ota/terminals/sync?stream=1", { method: "POST" });
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
      const headers = ["Name", "Address", "Status", "Zone", "Woreda", "City", "Companies"];
      const exportRows: (string | number)[][] = rows.map(t => [
        t.name, t.address ?? "—", t.status ?? "—", t.zoneName ?? "—", t.woredaName ?? "—", t.cityName ?? "—", t.companyNames ?? "—",
      ]);
      const stamp = new Date().toISOString().slice(0, 10);
      if (format === "csv") exportCSV(`ota-terminals-${stamp}`, headers, exportRows);
      else exportHTML(`ota-terminals-${stamp}`, "OTA Terminals", `${exportRows.length.toLocaleString()} rows (current page)`, headers, exportRows);
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
              <Landmark size={22} /> OTA Terminals
            </h1>
            <p style={{ fontSize: 13, color: "var(--muted-foreground)", margin: "3px 0 0", display: "flex", alignItems: "center", gap: 5 }}>
              Mirrored from OTA&apos;s nationwide terminal directory · {total.toLocaleString()} on file
              <InfoTip text="This is OTA's entire terminals table across every operator on the platform, not just this company's own stops — OTA's API doesn't scope this endpoint by company." size={12} />
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
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 14, marginBottom: 14, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--muted-foreground)", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.05em" }}>Status</label>
            <select style={{ ...iCss, cursor: "pointer" }} value={status} onChange={e => { setStatus(e.target.value); setOffset(0); }}>
              <option value="">All</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          <div style={{ minWidth: 200 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600, color: "var(--muted-foreground)", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Company
              <InfoTip text="A terminal can serve several companies — this matches any terminal where the company name you type appears in its list of operating companies." size={11} />
            </label>
            <input placeholder="e.g. Alphatech…" style={iCss} value={company} onChange={e => { setCompany(e.target.value); setOffset(0); }} />
          </div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--muted-foreground)", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.05em" }}>Search</label>
            <input placeholder="Name, address, city…" style={iCss} value={search} onChange={e => { setSearch(e.target.value); setOffset(0); }} />
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
            <Landmark size={36} style={{ marginBottom: 12, opacity: 0.25 }} />
            <p style={{ fontSize: 14 }}>No terminals on file yet.</p>
            <p style={{ fontSize: 12, marginTop: 4 }}>Click &ldquo;Sync now&rdquo; to pull the terminal directory from OTA.</p>
          </div>
        ) : (
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "var(--background)", borderBottom: "1px solid var(--border)" }}>
                    {["", "Name", "Address", "Status", "Zone", "Woreda", "City", "Companies"].map(h => (
                      <th key={h} style={{ textAlign: "left", padding: "10px 14px", fontSize: 11, fontWeight: 700, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(t => {
                    const isExpanded = expanded === t.id;
                    return (
                      <Fragment key={t.id}>
                        <tr onClick={() => setExpanded(isExpanded ? null : t.id)} style={{ borderBottom: "1px solid var(--border)", cursor: "pointer", background: isExpanded ? "color-mix(in srgb, var(--primary) 5%, transparent)" : undefined }}>
                          <td style={{ padding: "10px 0 10px 14px", width: 20 }}>
                            <ChevronDown size={14} color="var(--muted-foreground)" style={{ transform: isExpanded ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.15s" }} />
                          </td>
                          <td style={{ padding: "10px 14px", fontWeight: 600, color: "var(--foreground)", whiteSpace: "nowrap" }}>{t.name}</td>
                          <td style={{ padding: "10px 14px", color: "var(--muted-foreground)" }}>{t.address || "—"}</td>
                          <td style={{ padding: "10px 14px" }}>
                            <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: t.status === "active" ? "#dcfce7" : "#f1f5f9", color: t.status === "active" ? "#16a34a" : "#64748b", textTransform: "capitalize" }}>{t.status ?? "—"}</span>
                          </td>
                          <td style={{ padding: "10px 14px", color: "var(--muted-foreground)" }}>{t.zoneName ?? "—"}</td>
                          <td style={{ padding: "10px 14px", color: "var(--muted-foreground)" }}>{t.woredaName ?? "—"}</td>
                          <td style={{ padding: "10px 14px", color: "var(--muted-foreground)" }}>{t.cityName ?? "—"}</td>
                          <td style={{ padding: "10px 14px", color: "var(--muted-foreground)", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.companyNames ?? "—"}</td>
                        </tr>
                        {isExpanded && (
                          <tr>
                            <td colSpan={8} style={{ padding: 0, background: "var(--background)", borderBottom: "1px solid var(--border)" }}>
                              <div style={{ padding: 16 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 700, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>
                                  <Info size={12} /> Full payload from OTA
                                </div>
                                <pre style={{ margin: 0, fontSize: 11, lineHeight: 1.6, color: "var(--foreground)", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: 12, overflowX: "auto", maxHeight: 360, overflowY: "auto" }}>
                                  {JSON.stringify(t.raw, null, 2)}
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
              <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>Page {page} of {pages} · {total.toLocaleString()} terminals</span>
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
