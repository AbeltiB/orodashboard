"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Loader2, RefreshCw, ChevronLeft, User, Route as RouteIcon,
  TrendingUp, Users as UsersIcon, Wallet, AlertCircle,
} from "lucide-react";
import PortalHeader from "@/components/cashier/PortalHeader";

type Me = { employeeId: string; fullName: string; phone: string; stations: { id: string; name: string; code: string }[] };

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

type BreakdownRow = {
  date: string;
  departureTerminalName: string;
  arrivalTerminalName: string;
  trips: number;
  passengers: number;
  distanceKm: number;
  tariff: number;
  totalServiceCharge: number;
  totalCollected: number;
};

type FilterOptions = { stations: { id: string; name: string }[]; employees: { id: string; name: string }[]; arrivalTerminals: string[] };

type RangeMode = "today" | "week" | "month" | "custom";

function fmtETB(n: number) {
  return new Intl.NumberFormat("en-ET", { style: "currency", currency: "ETB", maximumFractionDigits: 2 }).format(n);
}
function isoDay(d: Date) {
  return d.toISOString().slice(0, 10);
}
function startOfWeek(d: Date) {
  const day = d.getDay(); // 0 = Sunday
  const diff = (day + 6) % 7; // days since Monday
  const monday = new Date(d);
  monday.setDate(d.getDate() - diff);
  return monday;
}
function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function fmtDayLabel(dateStr: string) {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short" });
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { headers: { "Content-Type": "application/json" }, ...init });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.message ?? json?.error ?? `Request failed: ${res.status}`);
  return json as T;
}

const cardStyle: React.CSSProperties = {
  padding: "16px", borderRadius: 14, background: "var(--surface)", border: "1px solid var(--border)",
};
const selCss: React.CSSProperties = {
  height: 38, padding: "0 10px", borderRadius: 9, border: "1.5px solid var(--border)",
  background: "var(--surface)", color: "var(--foreground)", fontSize: 13, outline: "none", cursor: "pointer",
};

export default function CashierSalesPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({ stations: [], employees: [], arrivalTerminals: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [rangeMode, setRangeMode] = useState<RangeMode>("today");
  const [customFrom, setCustomFrom] = useState(isoDay(new Date()));
  const [customTo, setCustomTo] = useState(isoDay(new Date()));
  const [route, setRoute] = useState("");

  const [byTicketer, setByTicketer] = useState<TicketerRow[]>([]);
  const [ticketerLoading, setTicketerLoading] = useState(true);

  const [selected, setSelected] = useState<TicketerRow | null>(null);
  const [breakdown, setBreakdown] = useState<BreakdownRow[]>([]);
  const [breakdownLoading, setBreakdownLoading] = useState(false);

  const [syncing, setSyncing] = useState(false);

  const { dateFrom, dateTo, rangeLabel } = useMemo(() => {
    const today = new Date();
    if (rangeMode === "today") return { dateFrom: isoDay(today), dateTo: isoDay(today), rangeLabel: "Today" };
    if (rangeMode === "week") return { dateFrom: isoDay(startOfWeek(today)), dateTo: isoDay(today), rangeLabel: "This week" };
    if (rangeMode === "month") return { dateFrom: isoDay(startOfMonth(today)), dateTo: isoDay(today), rangeLabel: "This month" };
    return { dateFrom: customFrom, dateTo: customTo, rangeLabel: "Custom" };
  }, [rangeMode, customFrom, customTo]);

  const loadMe = useCallback(async () => {
    const res = await fetch("/api/cashier/auth/me");
    if (res.status === 401) { router.push("/cashier/login"); return; }
    const json = await res.json();
    setMe(json);
  }, [router]);

  const loadFilterOptions = useCallback(async () => {
    try {
      const res = await apiFetch<FilterOptions>("/api/cashier/sales/filter-options");
      setFilterOptions(res);
    } catch { /* dropdown just stays empty */ }
  }, []);

  const loadByTicketer = useCallback(async () => {
    setTicketerLoading(true);
    try {
      const params = new URLSearchParams({ dateFrom, dateTo });
      if (route) params.set("arrivalTerminal", route);
      const res = await apiFetch<{ data: TicketerRow[] }>(`/api/cashier/sales/by-ticketer?${params.toString()}`);
      setByTicketer(res.data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load sales.");
    } finally {
      setTicketerLoading(false);
    }
  }, [dateFrom, dateTo, route]);

  const loadBreakdown = useCallback(async (employeeId: string) => {
    setBreakdownLoading(true);
    try {
      const params = new URLSearchParams({ dateFrom, dateTo });
      if (route) params.set("arrivalTerminal", route);
      const res = await apiFetch<{ data: BreakdownRow[] }>(`/api/cashier/sales/by-ticketer/${employeeId}/breakdown?${params.toString()}`);
      setBreakdown(res.data);
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Failed to load breakdown.");
    } finally {
      setBreakdownLoading(false);
    }
  }, [dateFrom, dateTo, route]);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadMe(), loadFilterOptions()]).finally(() => setLoading(false));
  }, [loadMe, loadFilterOptions]);

  useEffect(() => { loadByTicketer(); }, [loadByTicketer]);
  useEffect(() => { if (selected) loadBreakdown(selected.employeeId); }, [selected, loadBreakdown]);

  async function handleSync() {
    setSyncing(true);
    try {
      const res = await apiFetch<{ status: string; rowsCreated: number; rowsUpdated: number }>("/api/cashier/sales/sync", { method: "POST" });
      if (res.status === "SKIPPED") setToast("Already up to date.");
      else setToast(`Synced: ${res.rowsCreated} new trip${res.rowsCreated === 1 ? "" : "s"}.`);
      await loadByTicketer();
      if (selected) await loadBreakdown(selected.employeeId);
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Sync failed.");
    } finally {
      setSyncing(false);
    }
  }

  const byDate = useMemo(() => {
    const map = new Map<string, { date: string; trips: number; passengers: number; totalCollected: number }>();
    for (const r of breakdown) {
      const cur = map.get(r.date) ?? { date: r.date, trips: 0, passengers: 0, totalCollected: 0 };
      cur.trips += r.trips; cur.passengers += r.passengers; cur.totalCollected += r.totalCollected;
      map.set(r.date, cur);
    }
    return [...map.values()].sort((a, b) => b.date.localeCompare(a.date));
  }, [breakdown]);

  const byRoute = useMemo(() => {
    const map = new Map<string, { route: string; trips: number; passengers: number; totalCollected: number }>();
    for (const r of breakdown) {
      const key = r.arrivalTerminalName;
      const cur = map.get(key) ?? { route: key, trips: 0, passengers: 0, totalCollected: 0 };
      cur.trips += r.trips; cur.passengers += r.passengers; cur.totalCollected += r.totalCollected;
      map.set(key, cur);
    }
    return [...map.values()].sort((a, b) => b.totalCollected - a.totalCollected);
  }, [breakdown]);

  const grandTotal = byTicketer.reduce((s, r) => s + r.totalCollected, 0);

  if (error && !me) {
    return <main style={{ padding: 24, textAlign: "center", color: "var(--danger)" }}>{error}</main>;
  }

  return (
    <>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } } * { box-sizing: border-box; }`}</style>
      <main style={{ minHeight: "100vh", background: "var(--background)", padding: "20px 16px 60px" }}>
        <div style={{ maxWidth: 560, margin: "0 auto" }}>
          <PortalHeader me={me} />

          {me && me.stations.length === 0 && (
            <div style={{ ...cardStyle, textAlign: "center", color: "var(--muted-foreground)", marginBottom: 18 }}>
              You aren&apos;t assigned to any station yet. Contact your administrator.
            </div>
          )}

          {/* Range + sync */}
          <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ display: "flex", gap: 2, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 9, padding: 3 }}>
              {([["today", "Today"], ["week", "Week"], ["month", "Month"]] as const).map(([id, label]) => (
                <button key={id} onClick={() => setRangeMode(id)} style={{
                  height: 30, padding: "0 12px", borderRadius: 6, border: "none",
                  background: rangeMode === id ? "var(--primary)" : "transparent",
                  color: rangeMode === id ? "#fff" : "var(--muted-foreground)",
                  fontSize: 12.5, fontWeight: rangeMode === id ? 700 : 500, cursor: "pointer",
                }}>
                  {label}
                </button>
              ))}
            </div>
            <button
              onClick={handleSync}
              disabled={syncing}
              style={{ height: 36, padding: "0 12px", borderRadius: 9, border: "1.5px solid var(--border)", background: "var(--surface)", color: "var(--foreground)", fontSize: 12.5, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" }}
            >
              {syncing ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <RefreshCw size={13} />}
              {syncing ? "Syncing…" : "Sync now"}
            </button>
          </div>

          {rangeMode === "custom" && (
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} style={{ ...selCss, flex: 1 }} />
              <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} style={{ ...selCss, flex: 1 }} />
            </div>
          )}
          <button onClick={() => setRangeMode("custom")} style={{ background: "none", border: "none", color: "var(--muted-foreground)", fontSize: 11.5, cursor: "pointer", padding: 0, marginBottom: 12, textAlign: "left" }}>
            {rangeMode !== "custom" ? "Or pick a custom range…" : ""}
          </button>

          <div style={{ marginBottom: 14 }}>
            <select value={route} onChange={e => setRoute(e.target.value)} style={{ ...selCss, width: "100%" }}>
              <option value="">All routes</option>
              {filterOptions.arrivalTerminals.map(r => <option key={r} value={r}>→ {r}</option>)}
            </select>
          </div>

          {error && (
            <div style={{ display: "flex", gap: 8, padding: "10px 12px", background: "var(--danger-bg)", borderRadius: 8, marginBottom: 14 }}>
              <AlertCircle size={15} color="var(--danger)" style={{ flexShrink: 0, marginTop: 1 }} />
              <span style={{ fontSize: 13, color: "var(--danger)" }}>{error}</span>
            </div>
          )}

          {toast && (
            <div style={{ fontSize: 12.5, color: "var(--muted-foreground)", marginBottom: 14, textAlign: "center" }}>{toast}</div>
          )}

          {loading ? (
            <div style={{ textAlign: "center", padding: 40, color: "var(--muted-foreground)" }}>
              <Loader2 size={20} style={{ animation: "spin 1s linear infinite" }} />
            </div>
          ) : selected ? (
            /* ── Drill-down: one ticketer ── */
            <div>
              <button onClick={() => setSelected(null)} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--muted-foreground)", background: "none", border: "none", cursor: "pointer", marginBottom: 14, padding: 0 }}>
                <ChevronLeft size={15} /> All ticketers
              </button>

              <div style={{ ...cardStyle, marginBottom: 14, background: "color-mix(in srgb, var(--primary) 7%, var(--surface))", border: "1px solid color-mix(in srgb, var(--primary) 25%, transparent)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <User size={15} color="var(--primary)" />
                  <span style={{ fontSize: 16, fontWeight: 700, color: "var(--foreground)" }}>{selected.employeeName}</span>
                </div>
                <div style={{ fontSize: 11, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 3 }}>
                  Collect for {rangeLabel.toLowerCase()}
                </div>
                <div style={{ fontSize: 28, fontWeight: 800, color: "var(--primary)" }}>{fmtETB(selected.totalCollected)}</div>
                <div style={{ display: "flex", gap: 14, marginTop: 8, fontSize: 12.5, color: "var(--muted-foreground)" }}>
                  <span>{selected.trips.toLocaleString()} trips</span>
                  <span>{selected.passengers.toLocaleString()} passengers</span>
                </div>
              </div>

              {breakdownLoading ? (
                <div style={{ textAlign: "center", padding: 24, color: "var(--muted-foreground)" }}>
                  <Loader2 size={17} style={{ animation: "spin 1s linear infinite" }} />
                </div>
              ) : (
                <>
                  {byDate.length > 1 && (
                    <>
                      <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted-foreground)", marginBottom: 8 }}>By day</p>
                      <div style={{ display: "grid", gap: 8, marginBottom: 18 }}>
                        {byDate.map(d => (
                          <div key={d.date} style={{ ...cardStyle, padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ fontSize: 13, color: "var(--foreground)" }}>{fmtDayLabel(d.date)}</span>
                            <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>{d.trips} trips</span>
                            <span style={{ fontSize: 14, fontWeight: 700, color: "var(--primary)" }}>{fmtETB(d.totalCollected)}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted-foreground)", marginBottom: 8 }}>By route</p>
                  <div style={{ display: "grid", gap: 8 }}>
                    {byRoute.map(r => (
                      <div key={r.route} style={{ ...cardStyle, padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 13, color: "var(--foreground)", display: "flex", alignItems: "center", gap: 6 }}><RouteIcon size={12} color="var(--muted-foreground)" /> {r.route}</span>
                        <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>{r.trips} trips</span>
                        <span style={{ fontSize: 14, fontWeight: 700, color: "var(--primary)" }}>{fmtETB(r.totalCollected)}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          ) : (
            /* ── All ticketers for the period ── */
            <div>
              <div className="grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 18 }}>
                <div style={cardStyle}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--muted-foreground)", marginBottom: 4 }}><TrendingUp size={13} /> {rangeLabel} total</div>
                  <div style={{ fontSize: 17, fontWeight: 700, color: "var(--primary)" }}>{fmtETB(grandTotal)}</div>
                </div>
                <div style={cardStyle}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--muted-foreground)", marginBottom: 4 }}><UsersIcon size={13} /> Ticketers</div>
                  <div style={{ fontSize: 17, fontWeight: 700, color: "var(--foreground)" }}>{byTicketer.length}</div>
                </div>
              </div>

              {ticketerLoading ? (
                <div style={{ textAlign: "center", padding: 40, color: "var(--muted-foreground)" }}>
                  <Loader2 size={20} style={{ animation: "spin 1s linear infinite" }} />
                </div>
              ) : byTicketer.length === 0 ? (
                <div style={{ ...cardStyle, textAlign: "center", color: "var(--muted-foreground)" }}>
                  <Wallet size={28} style={{ marginBottom: 8, opacity: 0.3 }} />
                  <p style={{ fontSize: 13 }}>No sales for this period yet.</p>
                </div>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {byTicketer.map(r => (
                    <button key={r.employeeId} onClick={() => setSelected(r)} style={{ ...cardStyle, textAlign: "left", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
                      <div>
                        <div style={{ fontSize: 14.5, fontWeight: 600, color: "var(--foreground)", display: "flex", alignItems: "center", gap: 6 }}>
                          <User size={13} color="var(--muted-foreground)" /> {r.employeeName}
                        </div>
                        <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 2 }}>{r.trips} trips · {r.passengers} passengers</div>
                      </div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: "var(--primary)" }}>{fmtETB(r.totalCollected)}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
