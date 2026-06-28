"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  Navigation,
  Search,
  AlertCircle,
  Loader2,
  MapPin,
  ArrowRight,
} from "lucide-react";

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

// ─── API helper ───────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: { "Content-Type": "application/json" } });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error ?? `Request failed: ${res.status}`);
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

// ─── Main page ────────────────────────────────────────────────────────────────

export default function TerminalsPage() {
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
    <div style={{ minHeight: "100vh", background: "var(--background)", padding: "32px 36px" }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        * { box-sizing: border-box; }
      `}</style>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28, flexWrap: "wrap", gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--foreground)", margin: 0 }}>Terminals</h1>
          <p style={{ fontSize: 13, color: "var(--muted-foreground)", margin: "4px 0 0" }}>
            {loading ? "Loading…" : `${terminals.length} terminal${terminals.length !== 1 ? "s" : ""} from GET /api/terminals`}
          </p>
        </div>

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

      {/* Error */}
      {error && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", background: "#fee2e2", borderRadius: 10, marginBottom: 20, color: "#b91c1c", fontSize: 13 }}>
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: 60, color: "var(--muted-foreground)", fontSize: 13 }}>
          <Spinner /> Loading terminals…
        </div>
      )}

      {/* Empty */}
      {!loading && !error && filtered.length === 0 && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 0", color: "var(--muted-foreground)" }}>
          <Building2 size={44} style={{ marginBottom: 14, opacity: 0.3 }} />
          <p style={{ fontSize: 14, margin: 0 }}>
            {search ? `No terminals match "${search}"` : "No terminals found. Terminals are added from the Stations page."}
          </p>
        </div>
      )}

      {/* Table */}
      {!loading && filtered.length > 0 && (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1.5fr 1fr 1fr 1fr 1fr 1fr", gap: 16, padding: "14px 20px", background: "var(--background)", borderBottom: "1px solid var(--border)", fontSize: 11, fontWeight: 700, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            <div>Terminal</div>
            <div>Station</div>
            <div>Road</div>
            <div style={{ textAlign: "right" }}>Distance</div>
            <div style={{ textAlign: "center" }}>Departure</div>
            <div style={{ textAlign: "center" }}>Arrival</div>
            <div>Linked station</div>
          </div>

          {filtered.map((t) => (
            <div
              key={t.id}
              style={{
                display: "grid", gridTemplateColumns: "2fr 1.5fr 1fr 1fr 1fr 1fr 1fr", gap: 16,
                alignItems: "center", padding: "14px 20px", borderBottom: "1px solid var(--border)",
                fontSize: 13,
              }}
            >
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
