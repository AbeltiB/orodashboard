"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Loader2, RefreshCw, ChevronLeft, User, Route as RouteIcon,
  TrendingUp, Users as UsersIcon, Wallet, AlertCircle, Search, X, Coins, Landmark,
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

type RouteRow = {
  route: string;
  trips: number;
  passengers: number;
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
type SelectedEmployee = { id: string; name: string };

type RangeMode = "today" | "week" | "month" | "alltime" | "custom";
type ViewMode = "ticketer" | "route";

function fmtETB(n: number) {
  return new Intl.NumberFormat("en-ET", { style: "currency", currency: "ETB", maximumFractionDigits: 2 }).format(n);
}
function isoDay(d: Date) {
  return d.toISOString().slice(0, 10);
}
function startOfWeek(d: Date) {
  const day = d.getDay();
  const diff = (day + 6) % 7;
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
  height: 40, padding: "0 10px", borderRadius: 9, border: "1.5px solid var(--border)",
  background: "var(--surface)", color: "var(--foreground)", fontSize: 16, outline: "none", cursor: "pointer",
};

export default function CashierSalesPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [stationId, setStationId] = useState<string | null>(null);
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({ stations: [], employees: [], arrivalTerminals: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [rangeMode, setRangeMode] = useState<RangeMode>("today");
  const [customFrom, setCustomFrom] = useState(isoDay(new Date()));
  const [customTo, setCustomTo] = useState(isoDay(new Date()));
  const [route, setRoute] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("ticketer");

  const [ticketerSearch, setTicketerSearch] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);

  const [byTicketer, setByTicketer] = useState<TicketerRow[]>([]);
  const [byRoute, setByRoute] = useState<RouteRow[]>([]);
  const [listLoading, setListLoading] = useState(true);

  const [selected, setSelected] = useState<SelectedEmployee | null>(null);
  const [breakdown, setBreakdown] = useState<BreakdownRow[]>([]);
  const [breakdownLoading, setBreakdownLoading] = useState(false);

  const [syncing, setSyncing] = useState(false);

  const { dateFrom, dateTo, rangeLabel } = useMemo(() => {
    const today = new Date();
    if (rangeMode === "today") return { dateFrom: isoDay(today), dateTo: isoDay(today), rangeLabel: "Today" };
    if (rangeMode === "week") return { dateFrom: isoDay(startOfWeek(today)), dateTo: isoDay(today), rangeLabel: "This week" };
    if (rangeMode === "month") return { dateFrom: isoDay(startOfMonth(today)), dateTo: isoDay(today), rangeLabel: "This month" };
    if (rangeMode === "alltime") return { dateFrom: "", dateTo: "", rangeLabel: "All time" };
    return { dateFrom: customFrom, dateTo: customTo, rangeLabel: "Custom" };
  }, [rangeMode, customFrom, customTo]);

  const loadMe = useCallback(async () => {
    const res = await fetch("/api/cashier/auth/me");
    if (res.status === 401) { router.push("/cashier/login"); return; }
    const json = await res.json();
    setMe(json);
    if (json.stations?.length > 0) setStationId((prev: string | null) => prev ?? json.stations[0].id);
  }, [router]);

  useEffect(() => {
    setLoading(true);
    loadMe().finally(() => setLoading(false));
  }, [loadMe]);

  const loadFilterOptions = useCallback(async () => {
    if (!stationId) return;
    try {
      const res = await apiFetch<FilterOptions>(`/api/cashier/sales/filter-options?stationId=${stationId}`);
      setFilterOptions(res);
    } catch { /* dropdown just stays empty */ }
  }, [stationId]);

  const loadByTicketer = useCallback(async () => {
    if (!stationId) return;
    setListLoading(true);
    try {
      const params = new URLSearchParams({ stationId });
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      if (route) params.set("arrivalTerminal", route);
      const res = await apiFetch<{ data: TicketerRow[] }>(`/api/cashier/sales/by-ticketer?${params.toString()}`);
      setByTicketer(res.data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load sales.");
    } finally {
      setListLoading(false);
    }
  }, [stationId, dateFrom, dateTo, route]);

  const loadByRoute = useCallback(async () => {
    if (!stationId) return;
    setListLoading(true);
    try {
      const params = new URLSearchParams({ stationId });
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      const res = await apiFetch<{ data: RouteRow[] }>(`/api/cashier/sales/by-route?${params.toString()}`);
      setByRoute(res.data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load routes.");
    } finally {
      setListLoading(false);
    }
  }, [stationId, dateFrom, dateTo]);

  const loadBreakdown = useCallback(async (employeeId: string) => {
    if (!stationId) return;
    setBreakdownLoading(true);
    try {
      const params = new URLSearchParams({ stationId });
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      if (route) params.set("arrivalTerminal", route);
      const res = await apiFetch<{ data: BreakdownRow[] }>(`/api/cashier/sales/by-ticketer/${employeeId}/breakdown?${params.toString()}`);
      setBreakdown(res.data);
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Failed to load breakdown.");
    } finally {
      setBreakdownLoading(false);
    }
  }, [stationId, dateFrom, dateTo, route]);

  useEffect(() => { loadFilterOptions(); }, [loadFilterOptions]);
  useEffect(() => { if (viewMode === "ticketer" && !selected) loadByTicketer(); }, [viewMode, selected, loadByTicketer]);
  useEffect(() => { if (viewMode === "route" && !selected) loadByRoute(); }, [viewMode, selected, loadByRoute]);
  useEffect(() => { if (selected) loadBreakdown(selected.id); }, [selected, loadBreakdown]);

  function switchStation(id: string) {
    setStationId(id);
    setSelected(null);
    setRoute("");
    setTicketerSearch("");
  }

  async function handleSync() {
    setSyncing(true);
    try {
      const res = await apiFetch<{ status: string; rowsCreated: number; rowsUpdated: number }>("/api/cashier/sales/sync", { method: "POST" });
      if (res.status === "SKIPPED") setToast("Already up to date.");
      else setToast(`Synced: ${res.rowsCreated} new trip${res.rowsCreated === 1 ? "" : "s"}.`);
      if (selected) await loadBreakdown(selected.id);
      else if (viewMode === "ticketer") await loadByTicketer();
      else await loadByRoute();
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Sync failed.");
    } finally {
      setSyncing(false);
    }
  }

  const breakdownTotals = useMemo(() => {
    return breakdown.reduce(
      (acc, r) => ({
        trips: acc.trips + r.trips,
        passengers: acc.passengers + r.passengers,
        tariff: acc.tariff + r.tariff,
        totalServiceCharge: acc.totalServiceCharge + r.totalServiceCharge,
        totalCollected: acc.totalCollected + r.totalCollected,
      }),
      { trips: 0, passengers: 0, tariff: 0, totalServiceCharge: 0, totalCollected: 0 }
    );
  }, [breakdown]);

  const byDate = useMemo(() => {
    const map = new Map<string, { date: string; trips: number; passengers: number; tariff: number; totalServiceCharge: number; totalCollected: number }>();
    for (const r of breakdown) {
      const cur = map.get(r.date) ?? { date: r.date, trips: 0, passengers: 0, tariff: 0, totalServiceCharge: 0, totalCollected: 0 };
      cur.trips += r.trips; cur.passengers += r.passengers; cur.tariff += r.tariff; cur.totalServiceCharge += r.totalServiceCharge; cur.totalCollected += r.totalCollected;
      map.set(r.date, cur);
    }
    return [...map.values()].sort((a, b) => b.date.localeCompare(a.date));
  }, [breakdown]);

  const routeBreakdown = useMemo(() => {
    const map = new Map<string, { route: string; trips: number; passengers: number; totalCollected: number }>();
    for (const r of breakdown) {
      const key = r.arrivalTerminalName;
      const cur = map.get(key) ?? { route: key, trips: 0, passengers: 0, totalCollected: 0 };
      cur.trips += r.trips; cur.passengers += r.passengers; cur.totalCollected += r.totalCollected;
      map.set(key, cur);
    }
    return [...map.values()].sort((a, b) => b.totalCollected - a.totalCollected);
  }, [breakdown]);

  // The actual "hand this in at the end of the day" number for the station —
  // sales (tariff) + service charge collected, summed across whatever the
  // current view (ticketer or route) shows for this station and period.
  const depositSummary = useMemo(() => {
    const rows: { tariff: number; totalServiceCharge: number; totalCollected: number }[] = viewMode === "ticketer" ? byTicketer : byRoute;
    return rows.reduce(
      (acc, r) => ({ tariff: acc.tariff + r.tariff, totalServiceCharge: acc.totalServiceCharge + r.totalServiceCharge, totalCollected: acc.totalCollected + r.totalCollected }),
      { tariff: 0, totalServiceCharge: 0, totalCollected: 0 }
    );
  }, [viewMode, byTicketer, byRoute]);

  const matchingTicketers = useMemo(() => {
    if (!ticketerSearch.trim()) return [];
    const q = ticketerSearch.trim().toLowerCase();
    return filterOptions.employees.filter(e => e.name.toLowerCase().includes(q)).slice(0, 8);
  }, [ticketerSearch, filterOptions.employees]);

  const selectedStation = filterOptions.stations.find(s => s.id === stationId) ?? me?.stations.find(s => s.id === stationId);

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

          {/* Station picker — only shown when covering more than one */}
          {me && me.stations.length > 1 && (
            <div style={{ display: "flex", gap: 6, marginBottom: 14, overflowX: "auto", paddingBottom: 2 }}>
              {me.stations.map(s => (
                <button key={s.id} onClick={() => switchStation(s.id)} style={{
                  flexShrink: 0, height: 34, padding: "0 14px", borderRadius: 999, border: "1.5px solid",
                  borderColor: stationId === s.id ? "var(--primary)" : "var(--border)",
                  background: stationId === s.id ? "var(--primary)" : "var(--surface)",
                  color: stationId === s.id ? "#fff" : "var(--foreground)",
                  fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
                  display: "flex", alignItems: "center", gap: 6,
                }}>
                  <Landmark size={12} /> {s.name}
                </button>
              ))}
            </div>
          )}
          {selectedStation && me && me.stations.length === 1 && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--muted-foreground)", marginBottom: 14 }}>
              <Landmark size={12} /> {selectedStation.name}
            </div>
          )}

          {/* Ticketer search — jump straight to anyone who has ever worked this station */}
          {stationId && (
            <div style={{ position: "relative", marginBottom: 12 }}>
              <div style={{ position: "relative" }}>
                <Search size={14} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "var(--muted-foreground)" }} />
                <input
                  value={ticketerSearch}
                  onChange={e => setTicketerSearch(e.target.value)}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
                  placeholder="Search any ticketer — including past ones…"
                  style={{ ...selCss, width: "100%", height: 40, paddingLeft: 32, paddingRight: ticketerSearch ? 32 : 10 }}
                />
                {ticketerSearch && (
                  <button onClick={() => setTicketerSearch("")} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", display: "flex" }}>
                    <X size={14} />
                  </button>
                )}
              </div>
              {searchFocused && matchingTicketers.length > 0 && (
                <div style={{ position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, boxShadow: "0 8px 24px rgb(0 0 0 / 0.12)", zIndex: 20, overflow: "hidden" }}>
                  {matchingTicketers.map(e => (
                    <button key={e.id} onMouseDown={() => { setSelected({ id: e.id, name: e.name }); setTicketerSearch(""); }} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "10px 12px", border: "none", background: "none", cursor: "pointer", textAlign: "left", fontSize: 13.5, color: "var(--foreground)", borderBottom: "1px solid var(--border)" }}>
                      <User size={13} color="var(--muted-foreground)" /> {e.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Range + sync */}
          <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ display: "flex", gap: 2, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 9, padding: 3, flexWrap: "wrap" }}>
              {([["today", "Today"], ["week", "Week"], ["month", "Month"], ["alltime", "All time"]] as const).map(([id, label]) => (
                <button key={id} onClick={() => setRangeMode(id)} style={{
                  height: 30, padding: "0 10px", borderRadius: 6, border: "none",
                  background: rangeMode === id ? "var(--primary)" : "transparent",
                  color: rangeMode === id ? "#fff" : "var(--muted-foreground)",
                  fontSize: 12, fontWeight: rangeMode === id ? 700 : 500, cursor: "pointer",
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
            <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} style={{ ...selCss, flex: "1 1 140px", minWidth: 0 }} />
              <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} style={{ ...selCss, flex: "1 1 140px", minWidth: 0 }} />
            </div>
          )}
          <button onClick={() => setRangeMode("custom")} style={{ background: "none", border: "none", color: "var(--muted-foreground)", fontSize: 11.5, cursor: "pointer", padding: 0, marginBottom: 12, textAlign: "left" }}>
            {rangeMode !== "custom" ? "Or pick a custom range…" : ""}
          </button>

          {!selected && (
            <div style={{ marginBottom: 14 }}>
              <select value={route} onChange={e => setRoute(e.target.value)} style={{ ...selCss, width: "100%" }}>
                <option value="">All routes</option>
                {filterOptions.arrivalTerminals.map(r => <option key={r} value={r}>→ {r}</option>)}
              </select>
            </div>
          )}

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
                <ChevronLeft size={15} /> Back
              </button>

              <div style={{ ...cardStyle, marginBottom: 14, background: "color-mix(in srgb, var(--primary) 7%, var(--surface))", border: "1px solid color-mix(in srgb, var(--primary) 25%, transparent)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <User size={15} color="var(--primary)" />
                  <span style={{ fontSize: 16, fontWeight: 700, color: "var(--foreground)" }}>{selected.name}</span>
                </div>
                <div style={{ fontSize: 11, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 3 }}>
                  Total to collect — {rangeLabel.toLowerCase()}
                </div>
                <div style={{ fontSize: 28, fontWeight: 800, color: "var(--primary)", marginBottom: 8, wordBreak: "break-word" }}>{fmtETB(breakdownTotals.totalCollected)}</div>
                <div style={{ display: "flex", gap: 16, rowGap: 4, flexWrap: "wrap", fontSize: 12.5, color: "var(--foreground)" }}>
                  <span>Sales: <strong>{fmtETB(breakdownTotals.tariff)}</strong></span>
                  <span>Service charge: <strong>{fmtETB(breakdownTotals.totalServiceCharge)}</strong></span>
                </div>
                <div style={{ display: "flex", gap: 14, rowGap: 4, flexWrap: "wrap", marginTop: 8, fontSize: 12.5, color: "var(--muted-foreground)" }}>
                  <span>{breakdownTotals.trips.toLocaleString()} trips</span>
                  <span>{breakdownTotals.passengers.toLocaleString()} passengers</span>
                </div>
              </div>

              {breakdownLoading ? (
                <div style={{ textAlign: "center", padding: 24, color: "var(--muted-foreground)" }}>
                  <Loader2 size={17} style={{ animation: "spin 1s linear infinite" }} />
                </div>
              ) : breakdown.length === 0 ? (
                <div style={{ ...cardStyle, textAlign: "center", color: "var(--muted-foreground)" }}>
                  <p style={{ fontSize: 13 }}>No trips for {selected.name} in this period at this station.</p>
                  {rangeMode !== "alltime" && (
                    <button onClick={() => setRangeMode("alltime")} style={{ marginTop: 10, fontSize: 12.5, color: "var(--primary)", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>
                      Check all time instead
                    </button>
                  )}
                </div>
              ) : (
                <>
                  {byDate.length > 1 && (
                    <>
                      <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted-foreground)", marginBottom: 8 }}>By day</p>
                      <div style={{ display: "grid", gap: 8, marginBottom: 18 }}>
                        {byDate.map(d => (
                          <div key={d.date} style={{ ...cardStyle, padding: "12px 14px" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", rowGap: 4, gap: 8 }}>
                              <span style={{ fontSize: 13, color: "var(--foreground)" }}>{fmtDayLabel(d.date)}</span>
                              <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>{d.trips} trips</span>
                              <span style={{ fontSize: 14, fontWeight: 700, color: "var(--primary)" }}>{fmtETB(d.totalCollected)}</span>
                            </div>
                            <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 4 }}>
                              Sales {fmtETB(d.tariff)} · Service charge {fmtETB(d.totalServiceCharge)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted-foreground)", marginBottom: 8 }}>By route</p>
                  <div style={{ display: "grid", gap: 8 }}>
                    {routeBreakdown.map(r => (
                      <div key={r.route} style={{ ...cardStyle, padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", rowGap: 4, gap: 8 }}>
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
            /* ── Station overview: by ticketer or by route ── */
            <div>
              <div style={{ display: "flex", gap: 2, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 9, padding: 3, marginBottom: 14, width: "fit-content" }}>
                {([["ticketer", "By ticketer"], ["route", "By route"]] as const).map(([id, label]) => (
                  <button key={id} onClick={() => setViewMode(id)} style={{
                    height: 30, padding: "0 14px", borderRadius: 6, border: "none",
                    background: viewMode === id ? "var(--primary)" : "transparent",
                    color: viewMode === id ? "#fff" : "var(--muted-foreground)",
                    fontSize: 12.5, fontWeight: viewMode === id ? 700 : 500, cursor: "pointer",
                  }}>
                    {label}
                  </button>
                ))}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 18 }}>
                <div style={cardStyle}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--muted-foreground)", marginBottom: 4 }}><TrendingUp size={13} /> {rangeLabel} total</div>
                  <div style={{ fontSize: 17, fontWeight: 700, color: "var(--primary)" }}>{fmtETB(depositSummary.totalCollected)}</div>
                </div>
                <div style={cardStyle}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--muted-foreground)", marginBottom: 4 }}>
                    {viewMode === "ticketer" ? <UsersIcon size={13} /> : <RouteIcon size={13} />}
                    {viewMode === "ticketer" ? "Ticketers" : "Routes"}
                  </div>
                  <div style={{ fontSize: 17, fontWeight: 700, color: "var(--foreground)" }}>{viewMode === "ticketer" ? byTicketer.length : byRoute.length}</div>
                </div>
              </div>

              {listLoading ? (
                <div style={{ textAlign: "center", padding: 40, color: "var(--muted-foreground)" }}>
                  <Loader2 size={20} style={{ animation: "spin 1s linear infinite" }} />
                </div>
              ) : viewMode === "ticketer" ? (
                byTicketer.length === 0 ? (
                  <div style={{ ...cardStyle, textAlign: "center", color: "var(--muted-foreground)" }}>
                    <Wallet size={28} style={{ marginBottom: 8, opacity: 0.3 }} />
                    <p style={{ fontSize: 13 }}>No sales for this period yet.</p>
                  </div>
                ) : (
                  <div style={{ display: "grid", gap: 10 }}>
                    {byTicketer.map(r => (
                      <button key={r.employeeId} onClick={() => setSelected({ id: r.employeeId, name: r.employeeName })} style={{ ...cardStyle, textAlign: "left", cursor: "pointer", width: "100%" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", rowGap: 4, gap: 8 }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 14.5, fontWeight: 600, color: "var(--foreground)", display: "flex", alignItems: "center", gap: 6, wordBreak: "break-word" }}>
                              <User size={13} color="var(--muted-foreground)" style={{ flexShrink: 0 }} /> {r.employeeName}
                            </div>
                            <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 2 }}>{r.trips} trips · {r.passengers} passengers</div>
                          </div>
                          <div style={{ fontSize: 16, fontWeight: 700, color: "var(--primary)", whiteSpace: "nowrap" }}>{fmtETB(r.totalCollected)}</div>
                        </div>
                        <div style={{ display: "flex", gap: 14, rowGap: 4, flexWrap: "wrap", marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--border)", fontSize: 11.5, color: "var(--muted-foreground)" }}>
                          <span>Sales: <strong style={{ color: "var(--foreground)" }}>{fmtETB(r.tariff)}</strong></span>
                          <span>Service charge: <strong style={{ color: "var(--foreground)" }}>{fmtETB(r.totalServiceCharge)}</strong></span>
                        </div>
                      </button>
                    ))}
                  </div>
                )
              ) : byRoute.length === 0 ? (
                <div style={{ ...cardStyle, textAlign: "center", color: "var(--muted-foreground)" }}>
                  <RouteIcon size={28} style={{ marginBottom: 8, opacity: 0.3 }} />
                  <p style={{ fontSize: 13 }}>No sales for this period yet.</p>
                </div>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {byRoute.map(r => (
                    <div key={r.route} style={cardStyle}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", rowGap: 4, gap: 8 }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 14.5, fontWeight: 600, color: "var(--foreground)", display: "flex", alignItems: "center", gap: 6, wordBreak: "break-word" }}>
                            <RouteIcon size={13} color="var(--muted-foreground)" style={{ flexShrink: 0 }} /> {r.route}
                          </div>
                          <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 2 }}>{r.trips} trips · {r.passengers} passengers</div>
                        </div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: "var(--primary)", whiteSpace: "nowrap" }}>{fmtETB(r.totalCollected)}</div>
                      </div>
                      <div style={{ display: "flex", gap: 14, rowGap: 4, flexWrap: "wrap", marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--border)", fontSize: 11.5, color: "var(--muted-foreground)" }}>
                        <span>Sales: <strong style={{ color: "var(--foreground)" }}>{fmtETB(r.tariff)}</strong></span>
                        <span>Service charge: <strong style={{ color: "var(--foreground)" }}>{fmtETB(r.totalServiceCharge)}</strong></span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Deposit summary — the end-of-day bank amount */}
              {!listLoading && (byTicketer.length > 0 || byRoute.length > 0) && (
                <div style={{ ...cardStyle, marginTop: 18, background: "color-mix(in srgb, var(--success) 8%, var(--surface))", border: "1px solid color-mix(in srgb, var(--success) 30%, transparent)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--success)", marginBottom: 10 }}>
                    <Landmark size={13} /> To deposit — {rangeLabel.toLowerCase()}
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", rowGap: 4, gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 13, color: "var(--foreground)", display: "flex", alignItems: "center", gap: 6 }}><TrendingUp size={13} /> Sales (tariff)</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "var(--foreground)" }}>{fmtETB(depositSummary.tariff)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", rowGap: 4, gap: 8, marginBottom: 10 }}>
                    <span style={{ fontSize: 13, color: "var(--foreground)", display: "flex", alignItems: "center", gap: 6 }}><Coins size={13} /> Service charge</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "var(--foreground)" }}>{fmtETB(depositSummary.totalServiceCharge)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", rowGap: 4, gap: 8, paddingTop: 10, borderTop: "1px solid color-mix(in srgb, var(--success) 30%, transparent)" }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "var(--success)" }}>Total</span>
                    <span style={{ fontSize: 22, fontWeight: 800, color: "var(--success)", wordBreak: "break-word" }}>{fmtETB(depositSummary.totalCollected)}</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
