"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  Navigation,
  Search,
  AlertCircle,
  Loader2,
  MapPin,
  ArrowRightLeft,
  Route,
  ArrowDownToLine,
  Network,
  RefreshCw,
  Ruler,
  CheckCircle2,
} from "lucide-react";
import RouteNetworkDiagram from "@/components/ota/RouteNetworkDiagram";

// ─── Types matching GET /api/terminals ───────────────────────────────────────

type RoadType = "asphalt" | "gravel" | "mixed";

type StationRef = {
  id: string;
  name: string;
  code: string;
  region?: string;
};

type Terminal = {
  id: string;
  name: string;
  isStation: boolean;
  linkedStationId: string | null;
  isDeparture: boolean;
  isArrival: boolean;
  distanceKm: number;
  roadType: RoadType;
  asphaltKm: number | null;
  gravelKm: number | null;
  station: StationRef | null;
  linkedStation: StationRef | null;
};

// ─── Types matching GET /api/ota/company-routes ──────────────────────────────

type RouteDestination = { id: string; arrivalTerminalId: string; arrivalTerminalName: string; distanceKm: number; roadType: string | null; isActive: boolean };
type CompanyRouteTerminal = {
  id: string;
  name: string;
  station: { id: string; name: string; code: string } | null;
  destinationCount: number;
  activeDestinationCount: number;
  totalDistanceKm: number;
  activeTotalDistanceKm: number;
  destinations: RouteDestination[];
};
type CompanyRoutesResponse = {
  terminals: CompanyRouteTerminal[];
  totalRoutes: number;
  totalActiveRoutes: number;
  lastSync: { finishedAt: string; status: string } | null;
};

// ─── API helper ───────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { headers: { "Content-Type": "application/json" }, ...init });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.message ?? json?.error ?? `Request failed: ${res.status}`);
  return json as T;
}

// ─── Shared UI atoms ──────────────────────────────────────────────────────────

function Spinner() {
  return <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} color="var(--muted-foreground)" />;
}

function Badge({ label, color }: { label: string; color: "blue" | "green" | "slate" | "amber" | "purple" }) {
  const map = {
    blue:   { bg: "#dbeafe", fg: "#1d4ed8" },
    green:  { bg: "#dcfce7", fg: "#16a34a" },
    slate:  { bg: "#f1f5f9", fg: "#475569" },
    amber:  { bg: "#fef3c7", fg: "#d97706" },
    purple: { bg: "#ede9fe", fg: "#7c3aed" },
  };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 600, background: map[color].bg, color: map[color].fg }}>
      {label}
    </span>
  );
}

const roadColor: Record<RoadType, { bg: string; fg: string }> = {
  asphalt: { bg: "#f1f5f9", fg: "#0f172a" },
  gravel:  { bg: "#fef3c7", fg: "#d97706" },
  mixed:   { bg: "#ede9fe", fg: "#7c3aed" },
};

function roadLabel(r: RoadType) {
  return r.charAt(0).toUpperCase() + r.slice(1);
}

function fmtKm(n: number) {
  return `${n % 1 === 0 ? n : n.toFixed(1)} km`;
}

// ─── Route network tab (OTA-sourced, auto-synced) ────────────────────────────

function RouteNetworkTab() {
  const [data, setData] = useState<CompanyRoutesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = async () => {
    try {
      const res = await apiFetch<CompanyRoutesResponse>("/api/ota/company-routes");
      setData(res);
      setError(null);
      setSelectedId((prev) => prev ?? res.terminals.slice().sort((a, b) => b.destinationCount - a.destinationCount)[0]?.id ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load the route network.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  async function syncNow() {
    setSyncing(true);
    try {
      const res = await apiFetch<{ status: string; rowsCreated: number; rowsUpdated: number }>("/api/ota/company-routes/sync", { method: "POST" });
      setToast(res.status === "SUCCESS" || res.status === "PARTIAL" ? `Synced — ${res.rowsCreated} new, ${res.rowsUpdated} updated.` : `Sync ${res.status.toLowerCase()}.`);
      await load();
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Sync failed.");
    } finally {
      setSyncing(false);
    }
  }

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: 60, color: "var(--muted-foreground)", fontSize: 13 }}>
        <Spinner /> Loading route network…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", background: "#fee2e2", borderRadius: 10, color: "#b91c1c", fontSize: 13 }}>
        <AlertCircle size={16} /> {error ?? "Couldn't load the route network."}
      </div>
    );
  }

  const terminals = [...data.terminals].sort((a, b) => b.destinationCount - a.destinationCount);
  const selected = terminals.find((t) => t.id === selectedId) ?? terminals[0] ?? null;
  const operationalCount = terminals.filter((t) => t.station).length;
  const grandTotalKm = terminals.reduce((s, t) => s + t.totalDistanceKm, 0);

  return (
    <div>
      {toast && (
        <div style={{ position: "fixed", bottom: 28, right: 28, zIndex: 999, background: "#0f172a", color: "#fff", padding: "12px 20px", borderRadius: 12, fontSize: 13, fontWeight: 500, boxShadow: "0 8px 30px rgb(0 0 0 / 0.18)" }}>
          {toast}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, flexWrap: "wrap", gap: 12 }}>
        <p style={{ fontSize: 12.5, color: "var(--muted-foreground)", margin: 0 }}>
          {data.lastSync
            ? `Last synced ${new Date(data.lastSync.finishedAt).toLocaleString("en-GB")} (${data.lastSync.status.toLowerCase()}) — auto-syncs daily.`
            : "Never synced yet."}
        </p>
        <button
          onClick={syncNow}
          disabled={syncing}
          style={{ height: 36, padding: "0 14px", borderRadius: 9, border: "1.5px solid var(--border)", background: "var(--surface)", color: "var(--foreground)", fontSize: 12.5, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
        >
          {syncing ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <RefreshCw size={13} />}
          {syncing ? "Syncing…" : "Sync now"}
        </button>
      </div>

      <div className="grid-4" style={{ gap: 12, marginBottom: 24 }}>
        {[
          { label: "Departure terminals", value: terminals.length, icon: <Navigation size={16} />, color: "#1d4ed8", bg: "#dbeafe" },
          { label: "Active / registered routes", value: `${data.totalActiveRoutes}/${data.totalRoutes}`, icon: <Route size={16} />, color: "#7c3aed", bg: "#ede9fe" },
          { label: "Operational (staffed)", value: `${operationalCount}/${terminals.length}`, icon: <CheckCircle2 size={16} />, color: "#16a34a", bg: "#dcfce7" },
          { label: "Total network distance", value: fmtKm(grandTotalKm), icon: <Ruler size={16} />, color: "#d97706", bg: "#fef3c7" },
        ].map((c) => (
          <div key={c.label} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "12px 14px", display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 9, background: c.bg, color: c.color, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{c.icon}</div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "var(--foreground)", lineHeight: 1, fontFamily: "monospace" }}>{c.value}</div>
              <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 3 }}>{c.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Terminal picker */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
        {terminals.map((t) => (
          <button
            key={t.id}
            onClick={() => setSelectedId(t.id)}
            style={{
              display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", borderRadius: 999,
              border: "1.5px solid", borderColor: selected?.id === t.id ? "var(--primary)" : "var(--border)",
              background: selected?.id === t.id ? "var(--primary)" : "var(--surface)",
              color: selected?.id === t.id ? "#fff" : "var(--foreground)",
              fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
            }}
          >
            {t.name}
            <span style={{ fontSize: 11, fontWeight: 700, opacity: 0.8 }}>{t.activeDestinationCount}/{t.destinationCount}</span>
            {!t.station && (
              <span title="Not yet set up as an operational station" style={{ width: 6, height: 6, borderRadius: "50%", background: selected?.id === t.id ? "#fff" : "#d97706" }} />
            )}
          </button>
        ))}
      </div>

      {selected && (() => {
        const activeDestinations = selected.destinations.filter((d) => d.isActive);
        const registeredOnly = selected.destinations.filter((d) => !d.isActive);
        const sortedTable = [...selected.destinations].sort((a, b) => (a.isActive === b.isActive ? a.distanceKm - b.distanceKm : a.isActive ? -1 : 1));
        return (
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.1fr) minmax(0, 1fr)", gap: 20 }}>
            {/* Visual mapping — active routes only, per the diagram's job of showing what's actually running */}
            <div>
              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: 20, marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4, flexWrap: "wrap", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--foreground)", margin: 0 }}>{selected.name}</h3>
                    {selected.station ? <Badge label="Operational" color="green" /> : <Badge label="Not yet staffed" color="amber" />}
                  </div>
                  <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>{activeDestinations.length} active · {fmtKm(selected.activeTotalDistanceKm)}</span>
                </div>
                <p style={{ fontSize: 11.5, color: "var(--muted-foreground)", margin: "0 0 8px" }}>
                  Routes with real ticket sales on file. {registeredOnly.length > 0 && `${registeredOnly.length} more are registered with OTA but haven't sold a ticket yet — see the panel below.`}
                </p>
                <RouteNetworkDiagram terminalName={selected.name} destinations={activeDestinations} />
              </div>

              {registeredOnly.length > 0 && (
                <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "16px 20px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
                    <AlertCircle size={14} color="#d97706" />
                    <h4 style={{ fontSize: 13, fontWeight: 700, color: "var(--foreground)", margin: 0 }}>
                      Also registered — not active yet ({registeredOnly.length})
                    </h4>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {registeredOnly.sort((a, b) => a.distanceKm - b.distanceKm).map((d) => (
                      <span key={d.id} style={{ fontSize: 12, padding: "4px 10px", borderRadius: 999, background: "var(--background)", border: "1px solid var(--border)", color: "var(--muted-foreground)" }}>
                        {d.arrivalTerminalName} <span style={{ fontFamily: "monospace", fontWeight: 600 }}>{fmtKm(d.distanceKm)}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Literal mapping */}
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden", maxHeight: 560, overflowY: "auto" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 90px 70px 60px", gap: 10, padding: "12px 16px", background: "var(--background)", borderBottom: "1px solid var(--border)", fontSize: 11, fontWeight: 700, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.05em", position: "sticky", top: 0 }}>
                <div>Destination</div>
                <div style={{ textAlign: "right" }}>Distance</div>
                <div>Road</div>
                <div style={{ textAlign: "center" }}>Ours</div>
              </div>
              {sortedTable.map((d) => (
                <div key={d.id} style={{ display: "grid", gridTemplateColumns: "1fr 90px 70px 60px", gap: 10, padding: "10px 16px", borderBottom: "1px solid var(--border)", fontSize: 13, alignItems: "center", opacity: d.isActive ? 1 : 0.65 }}>
                  <div style={{ color: "var(--foreground)", fontWeight: 500 }}>{d.arrivalTerminalName}</div>
                  <div style={{ textAlign: "right", fontFamily: "monospace", fontWeight: 700, color: "var(--foreground)" }}>{fmtKm(d.distanceKm)}</div>
                  <div>
                    {d.roadType ? (
                      <span style={{ fontSize: 10.5, fontWeight: 600, padding: "2px 6px", borderRadius: 999, background: d.roadType === "gravel" ? "#fef3c7" : "#f1f5f9", color: d.roadType === "gravel" ? "#d97706" : "#475569" }}>
                        {d.roadType}
                      </span>
                    ) : (
                      <span style={{ color: "var(--muted-foreground)" }}>—</span>
                    )}
                  </div>
                  <div style={{ textAlign: "center" }}>
                    {d.isActive ? <CheckCircle2 size={15} color="#16a34a" /> : <span style={{ color: "var(--muted-foreground)" }}>—</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ─── Deposit terminals tab (existing content, unchanged) ─────────────────────

function DepositTerminalsTab() {
  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [search, setSearch]       = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiFetch<{ data: Terminal[]; meta: { total: number } }>("/api/terminals")
      .then((res) => { if (!cancelled) { setTerminals(res.data); setError(null); } })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load terminals."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    return terminals.filter((t) =>
      t.name.toLowerCase().includes(term) ||
      t.station?.name.toLowerCase().includes(term) ||
      t.station?.code.toLowerCase().includes(term) ||
      t.linkedStation?.name.toLowerCase().includes(term)
    );
  }, [terminals, search]);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap", gap: 16 }}>
        <p style={{ fontSize: 13, color: "var(--muted-foreground)", margin: 0 }}>
          {loading ? "Loading…" : `${terminals.length} terminal${terminals.length !== 1 ? "s" : ""} — used for deposit reconciliation and cashier assignment.`}
        </p>
        <div style={{ position: "relative", width: 320 }}>
          <Search size={14} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "var(--muted-foreground)" }} />
          <input
            placeholder="Search terminal or station…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: "100%", height: 38, padding: "0 12px 0 32px",
              border: "1.5px solid var(--border)", borderRadius: 10,
              background: "var(--surface)", color: "var(--foreground)",
              fontSize: 13, outline: "none",
            }}
          />
        </div>
      </div>

      <div className="grid-4" style={{ gap: 12, marginBottom: 24 }}>
        {[
          { label: "Total terminals", value: terminals.length, icon: <Navigation size={16} />, color: "#1d4ed8", bg: "#dbeafe" },
          { label: "Departures", value: terminals.filter(t => t.isDeparture).length, icon: <ArrowDownToLine size={16} />, color: "#16a34a", bg: "#dcfce7" },
          { label: "Arrivals", value: terminals.filter(t => t.isArrival).length, icon: <ArrowRightLeft size={16} />, color: "#7c3aed", bg: "#ede9fe" },
          { label: "Linked stations", value: terminals.filter(t => t.linkedStation).length, icon: <Route size={16} />, color: "#d97706", bg: "#fef3c7" },
        ].map(c => (
          <div key={c.label} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "12px 14px", display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 9, background: c.bg, color: c.color, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{c.icon}</div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "var(--foreground)", lineHeight: 1, fontFamily: "monospace" }}>{loading ? "—" : c.value}</div>
              <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 3 }}>{c.label}</div>
            </div>
          </div>
        ))}
      </div>

      {error && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", background: "#fee2e2", borderRadius: 10, marginBottom: 20, color: "#b91c1c", fontSize: 13 }}>
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {loading && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: 60, color: "var(--muted-foreground)", fontSize: 13 }}>
          <Spinner /> Loading terminals…
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 0", color: "var(--muted-foreground)" }}>
          <Building2 size={44} style={{ marginBottom: 14, opacity: 0.3 }} />
          <p style={{ fontSize: 14, margin: 0 }}>
            {search ? `No terminals match "${search}"` : "No terminals found. Terminals are added from the Stations page."}
          </p>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "36px 2fr 1.5fr 1fr 1fr 1fr 1fr 1fr", gap: 16, padding: "14px 20px", background: "var(--background)", borderBottom: "1px solid var(--border)", fontSize: 11, fontWeight: 700, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            <div>#</div>
            <div>Terminal</div>
            <div>Station</div>
            <div>Road</div>
            <div style={{ textAlign: "right" }}>Distance</div>
            <div style={{ textAlign: "center" }}>Departure</div>
            <div style={{ textAlign: "center" }}>Arrival</div>
            <div>Linked station</div>
          </div>

          {filtered.map((t, i) => (
            <div
              key={t.id}
              style={{
                display: "grid", gridTemplateColumns: "36px 2fr 1.5fr 1fr 1fr 1fr 1fr 1fr", gap: 16,
                alignItems: "center", padding: "14px 20px", borderBottom: "1px solid var(--border)",
                fontSize: 13,
              }}
            >
              <div style={{ color: "var(--muted-foreground)", fontFamily: "monospace", fontSize: 12 }}>{i + 1}</div>

              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: 9, background: "#dbeafe", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Navigation size={15} color="#1d4ed8" />
                </div>
                <div>
                  <div style={{ fontWeight: 600, color: "var(--foreground)" }}>{t.name}</div>
                  {t.isStation && <Badge label="Station" color="blue" />}
                </div>
              </div>

              <div>
                {t.station ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--foreground)" }}>
                    <MapPin size={12} color="var(--muted-foreground)" />
                    <span>{t.station.name}</span>
                    <span style={{ fontSize: 11, color: "var(--muted-foreground)", fontFamily: "monospace" }}>{t.station.code}</span>
                  </div>
                ) : (
                  <span style={{ color: "var(--muted-foreground)" }}>—</span>
                )}
              </div>

              <div>
                <span style={{
                  display: "inline-flex", alignItems: "center", padding: "2px 8px", borderRadius: 999,
                  fontSize: 11, fontWeight: 600,
                  background: roadColor[t.roadType].bg, color: roadColor[t.roadType].fg,
                }}>
                  {roadLabel(t.roadType)}
                </span>
              </div>

              <div style={{ textAlign: "right", fontWeight: 700, fontFamily: "monospace", color: "var(--foreground)" }}>
                {Number(t.distanceKm).toFixed(1)} km
              </div>

              <div style={{ textAlign: "center" }}>
                {t.isDeparture ? <Badge label="Yes" color="green" /> : <span style={{ color: "var(--muted-foreground)" }}>—</span>}
              </div>

              <div style={{ textAlign: "center" }}>
                {t.isArrival ? <Badge label="Yes" color="blue" /> : <span style={{ color: "var(--muted-foreground)" }}>—</span>}
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--foreground)" }}>
                {t.linkedStation ? (
                  <>
                    <Building2 size={12} color="var(--primary)" />
                    <span>{t.linkedStation.name}</span>
                  </>
                ) : (
                  <span style={{ color: "var(--muted-foreground)" }}>—</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function TerminalsPage() {
  const [tab, setTab] = useState<"network" | "deposits">("network");

  return (
    <div style={{ minHeight: "100vh", background: "var(--background)", padding: "32px 36px" }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        * { box-sizing: border-box; }
      `}</style>

      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--foreground)", margin: 0 }}>Terminals</h1>
        <p style={{ fontSize: 13, color: "var(--muted-foreground)", margin: "4px 0 0" }}>
          Your route network (destinations + distances, synced from OTA) and the terminals used for deposit reconciliation.
        </p>
      </div>

      <div style={{ display: "flex", gap: 2, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 3, marginBottom: 24, width: "fit-content" }}>
        {([["network", "Route network", Network], ["deposits", "Deposit terminals", MapPin]] as const).map(([id, label, Icon]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            style={{
              display: "flex", alignItems: "center", gap: 7, height: 36, padding: "0 16px", borderRadius: 7, border: "none",
              background: tab === id ? "var(--primary)" : "transparent",
              color: tab === id ? "#fff" : "var(--muted-foreground)",
              fontSize: 13.5, fontWeight: tab === id ? 700 : 500, cursor: "pointer",
            }}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {tab === "network" ? <RouteNetworkTab /> : <DepositTerminalsTab />}
    </div>
  );
}
