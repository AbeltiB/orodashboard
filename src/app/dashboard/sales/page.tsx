"use client";

import { useCallback, useEffect, useState } from "react";
import {
  TrendingUp, RefreshCw, Check, AlertCircle, History,
  MapPin, User, Truck, ChevronLeft, ChevronRight, Loader2,
} from "lucide-react";
import { dateToEthiopian, formatEthiopianDate } from "@/lib/ethiopian-calendar";

// ─── Types matching the sales API ──────────────────────────────────────────────

type SyncSource = "MANUAL" | "AUTO";
type SyncStatus = "SUCCESS" | "FAILED" | "PARTIAL" | "SKIPPED" | "RATE_LIMITED";

type SalesTrip = {
  id: string;
  date: string;
  distanceKm: number;
  tariff: number;
  serviceCharge: number;
  passengers: number;
  level: string;
  departureTerminalName: string;
  arrivalTerminalName: string;
  employee: { id: string; name: string | null; email: string | null } | null;
  vehicle: { id: string; plateNo: string | null; plateCode: string | null; fleetCategory: string | null } | null;
};

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
function fmtMoney(n: number) {
  return n.toLocaleString("en-ET", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function statusStyle(s: SyncStatus): { bg: string; fg: string } {
  if (s === "SUCCESS") return { bg: "#dcfce7", fg: "#16a34a" };
  if (s === "PARTIAL") return { bg: "#fef3c7", fg: "#d97706" };
  if (s === "SKIPPED") return { bg: "#f1f5f9", fg: "#64748b" };
  if (s === "RATE_LIMITED") return { bg: "#ede9fe", fg: "#7c3aed" };
  return { bg: "#fee2e2", fg: "#dc2626" };
}

const iCss: React.CSSProperties = {
  height: 38, padding: "0 12px", border: "1.5px solid var(--border)", borderRadius: 9,
  background: "var(--surface)", color: "var(--foreground)", fontSize: 13, outline: "none",
};

function Badge({ label, bg, fg }: { label: string; bg: string; fg: string }) {
  return <span style={{ display: "inline-flex", alignItems: "center", padding: "2px 10px", borderRadius: 999, fontSize: 11, fontWeight: 600, background: bg, color: fg }}>{label}</span>;
}

function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useState(() => { const t = setTimeout(onDone, 3200); return () => clearTimeout(t); });
  return (
    <div style={{ position: "fixed", bottom: 28, right: 28, zIndex: 9999, background: "#0f172a", color: "#fff", padding: "12px 20px", borderRadius: 12, fontSize: 14, fontWeight: 500, display: "flex", alignItems: "center", gap: 8, boxShadow: "0 8px 30px rgb(0 0 0 / 0.18)" }}>
      <Check size={15} strokeWidth={2.5} color="#4ade80" />{message}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 50;

export default function SalesPage() {
  const [trips, setTrips] = useState<SalesTrip[]>([]);
  const [total, setTotal] = useState(0);
  const [totals, setTotals] = useState({ tariff: 0, serviceCharge: 0, distanceKm: 0, passengers: 0 });
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");

  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [logs, setLogs] = useState<SalesSyncLog[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const loadTrips = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ offset: String(offset), limit: String(PAGE_SIZE) });
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      if (search) params.set("search", search);
      const res = await apiFetch<{ data: SalesTrip[]; meta: { total: number }; totals: typeof totals }>(`/api/sales/trips?${params.toString()}`);
      setTrips(res.data);
      setTotal(res.meta.total);
      setTotals(res.totals);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load trips.");
    } finally {
      setLoading(false);
    }
  }, [offset, dateFrom, dateTo, search]);

  const loadLogs = useCallback(async () => {
    try {
      const res = await apiFetch<{ data: SalesSyncLog[] }>("/api/sales/sync?limit=10");
      setLogs(res.data);
    } catch {
      // sync history is a secondary panel — a failed load shouldn't block the page
    }
  }, []);

  useEffect(() => { loadTrips(); }, [loadTrips]);
  useEffect(() => { loadLogs(); }, [loadLogs]);

  async function handleSync() {
    setSyncing(true);
    try {
      const res = await apiFetch<{ status: SyncStatus; passes: number; rowsFetched: number; rowsCreated: number; rowsUpdated: number; pagesFetched: number; sourceTotal: number | null; ourTotal: number | null; errorMessage: string | null }>("/api/sales/sync", { method: "POST" });
      if (res.status === "RATE_LIMITED") {
        setToast(`Rate limited by the source — will retry automatically once the cooldown passes.`);
      } else if (res.status === "SKIPPED" && res.errorMessage) {
        setToast(res.errorMessage);
      } else if (res.status === "SKIPPED") {
        setToast(`Already up to date — ${res.ourTotal?.toLocaleString() ?? "?"} trips, nothing new on the source.`);
      } else {
        const gap = res.sourceTotal !== null && res.ourTotal !== null ? res.sourceTotal - res.ourTotal : null;
        setToast(
          `Synced: ${res.rowsCreated} new, ${res.rowsUpdated} already known (${res.passes} pass${res.passes === 1 ? "" : "es"}, ${res.pagesFetched} page${res.pagesFetched === 1 ? "" : "s"})` +
          (gap !== null ? gap === 0 ? " — fully caught up" : ` — still ${gap} behind the source, will retry next sync` : "")
        );
      }
      setOffset(0);
      await Promise.all([loadTrips(), loadLogs()]);
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  const latestLog = logs[0] ?? null;
  const completenessGap = latestLog?.sourceTotal != null && latestLog?.ourTotal != null ? latestLog.sourceTotal - latestLog.ourTotal : null;

  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } } * { box-sizing: border-box; }`}</style>
      {toast && <Toast message={toast} onDone={() => setToast(null)} />}

      <div style={{ minHeight: "100vh", background: "var(--background)", padding: "24px 28px" }}>

        {/* Top bar */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--foreground)", margin: 0 }}>Sales</h1>
            <p style={{ fontSize: 13, color: "var(--muted-foreground)", margin: "3px 0 0" }}>
              Mirrored from the OTA ticketing system · {total.toLocaleString()} trips on file
            </p>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => setShowHistory(s => !s)} style={{ height: 40, padding: "0 16px", borderRadius: 10, border: "1.5px solid var(--border)", background: "var(--surface)", fontSize: 14, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 7, color: "var(--foreground)" }}>
              <History size={15} /> Sync history
            </button>
            <button onClick={handleSync} disabled={syncing} style={{ height: 40, padding: "0 18px", borderRadius: 10, border: "none", background: "var(--primary)", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 7, opacity: syncing ? 0.7 : 1 }}>
              {syncing ? <Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} /> : <RefreshCw size={15} />}
              {syncing ? "Syncing…" : "Sync now"}
            </button>
          </div>
        </div>

        {/* Completeness banner — driven by the most recent sync's own count comparison */}
        {latestLog && completenessGap !== null && (
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

        {/* Summary chips (for the current filtered view) */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 18 }}>
          {[
            { label: "Trips", value: total.toLocaleString() },
            { label: "Tariff total", value: `${fmtMoney(totals.tariff)} ETB` },
            { label: "Service charge total", value: `${fmtMoney(totals.serviceCharge)} ETB` },
            { label: "Passengers", value: totals.passengers.toLocaleString() },
          ].map(s => (
            <div key={s.label} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "12px 14px" }}>
              <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontSize: 17, fontWeight: 700, color: "var(--foreground)" }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Filters — intentionally basic for now, better filtering is a follow-up */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 2fr", gap: 10, marginBottom: 14 }}>
          <input type="date" style={iCss} value={dateFrom} onChange={e => { setDateFrom(e.target.value); setOffset(0); }} title="From date" />
          <input type="date" style={iCss} value={dateTo} onChange={e => { setDateTo(e.target.value); setOffset(0); }} title="To date" />
          <input placeholder="Search employee, terminal, plate…" style={iCss} value={search} onChange={e => { setSearch(e.target.value); setOffset(0); }} />
        </div>

        {error && (
          <div style={{ display: "flex", gap: 8, padding: "10px 12px", background: "#fee2e2", borderRadius: 8, marginBottom: 14 }}>
            <AlertCircle size={15} color="#dc2626" style={{ flexShrink: 0, marginTop: 1 }} />
            <span style={{ fontSize: 13, color: "#dc2626" }}>{error}</span>
          </div>
        )}

        {/* Trips table */}
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--muted-foreground)", fontSize: 13 }}>Loading trips…</div>
        ) : trips.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "60px 0", color: "var(--muted-foreground)" }}>
            <TrendingUp size={36} style={{ marginBottom: 12, opacity: 0.25 }} />
            <p style={{ fontSize: 14 }}>No trips on file yet.</p>
            <p style={{ fontSize: 12, marginTop: 4 }}>Click &ldquo;Sync now&rdquo; to pull data from the OTA system.</p>
          </div>
        ) : (
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "var(--background)", borderBottom: "1px solid var(--border)" }}>
                    {["Date", "Route", "Employee", "Vehicle", "Level", "Distance", "Tariff", "Service chg.", "Pax"].map(h => (
                      <th key={h} style={{ textAlign: "left", padding: "10px 14px", fontSize: 11, fontWeight: 700, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {trips.map(t => (
                    <tr key={t.id} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "10px 14px", whiteSpace: "nowrap", color: "var(--foreground)" }}>
                        {fmtDateTime(t.date)}
                        <div style={{ fontSize: 11, color: "var(--muted-foreground)" }}>{formatEthiopianDate(dateToEthiopian(new Date(t.date)))} E.C.</div>
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
                      <td style={{ padding: "10px 14px", color: "var(--muted-foreground)", fontFamily: "monospace" }}>{fmtMoney(t.serviceCharge)}</td>
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
        )}
      </div>
    </>
  );
}
