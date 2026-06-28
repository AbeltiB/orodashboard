"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Pencil, X, Calculator, Bus, RefreshCw, Info, AlertCircle, Loader2 } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type RoadType  = "asphalt" | "gravel";
type BusTypeId = "bus" | "midbus" | "minibus";
type APILevel  = "LEVEL_1" | "LEVEL_2" | "LEVEL_3";

type LevelRates = {
  asphaltRate: number;
  gravelRate:  number;
};

type BusTypeMatrix = {
  id:          BusTypeId;
  label:       string;
  description: string;
  icon:        string;
  color:       string;
  lightColor:  string;
  apiKey:      string;
  levels: {
    1: LevelRates;
    2: LevelRates;
    3: LevelRates;
  };
};

// ─── Static bus-type metadata (rates come from /api/fare-matrix) ──────────────

const BUS_TYPE_META: Omit<BusTypeMatrix, "levels">[] = [
  {
    id: "bus", label: "Bus", description: "Full-size (45+ seats)",
    icon: "🚌", color: "#2563eb", lightColor: "#dbeafe", apiKey: "BUS",
  },
  {
    id: "midbus", label: "Midbus", description: "Mid-size (25–44 seats)",
    icon: "🚐", color: "#7c3aed", lightColor: "#ede9fe", apiKey: "MIDBUS",
  },
  {
    id: "minibus", label: "Minibus", description: "Mini (up to 24 seats)",
    icon: "🚙", color: "#0369a1", lightColor: "#e0f2fe", apiKey: "MINIBUS",
  },
];

function levelApiKey(level: 1 | 2 | 3): APILevel {
  return `LEVEL_${level}`;
}

const LEVEL_META: { id: 1|2|3; label: string; desc: string }[] = [
  { id: 1, label: "Level 1", desc: "Standard"  },
  { id: 2, label: "Level 2", desc: "Mid-class" },
  { id: 3, label: "Level 3", desc: "Premium"   },
];

const LEVEL_COLORS = ["#2563eb", "#7c3aed", "#0369a1"] as const;
const LEVEL_LIGHTS = ["#dbeafe", "#ede9fe", "#e0f2fe"] as const;

const ROAD_TYPES = [
  { key: "asphalt" as RoadType, label: "Asphalt", color: "#0f172a", bg: "#f1f5f9", dot: "#0f172a" },
  { key: "gravel"  as RoadType, label: "Gravel",  color: "#d97706", bg: "#fef3c7", dot: "#d97706" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return n.toLocaleString("en-ET", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtR(n: number) { return n.toFixed(2); }
function calcFare(rates: LevelRates, akm: number, gkm: number) {
  return rates.asphaltRate * akm + rates.gravelRate * gkm;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error ?? `Request failed: ${res.status}`);
  return json as T;
}

function buildMatrixFromAPI(
  apiMatrix: Record<string, Record<string, { asphaltRate: number; gravelRate: number }>>
): BusTypeMatrix[] {
  return BUS_TYPE_META.map(bt => {
    const apiLevels = apiMatrix[bt.apiKey] ?? {};
    return {
      ...bt,
      levels: {
        1: apiLevels["LEVEL_1"] ?? { asphaltRate: 0, gravelRate: 0 },
        2: apiLevels["LEVEL_2"] ?? { asphaltRate: 0, gravelRate: 0 },
        3: apiLevels["LEVEL_3"] ?? { asphaltRate: 0, gravelRate: 0 },
      },
    };
  });
}

function buildRowsFromMatrix(matrix: BusTypeMatrix[]) {
  return matrix.flatMap(bt =>
    ([1, 2, 3] as const).map(level => ({
      busType: bt.apiKey,
      busLevel: levelApiKey(level),
      asphaltRate: bt.levels[level].asphaltRate,
      gravelRate: bt.levels[level].gravelRate,
    }))
  );
}

// ─── Inline-editable rate cell ────────────────────────────────────────────────

function RateCell({ value, color, lightColor, onChange }: {
  value: number; color: string; lightColor: string;
  onChange: (v: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState(fmtR(value));

  function commit() {
    const n = parseFloat(draft);
    if (!isNaN(n) && n >= 0) onChange(n);
    setEditing(false);
  }

  if (editing) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <input autoFocus value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
          style={{ width: 82, height: 34, padding: "0 8px", border: `2px solid ${color}`, borderRadius: 7, fontSize: 13, fontWeight: 700, fontFamily: "monospace", color, outline: "none", background: lightColor, boxShadow: `0 0 0 3px ${color}22` }}
        />
        <button onClick={commit} style={{ width: 26, height: 26, borderRadius: 6, border: "none", background: color, color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Check size={12} strokeWidth={2.5} />
        </button>
        <button onClick={() => setEditing(false)} style={{ width: 26, height: 26, borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: "var(--muted-foreground)" }}>
          <X size={12} />
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => { setDraft(fmtR(value)); setEditing(true); }}
      style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 7, border: `1.5px solid ${lightColor}`, background: lightColor, cursor: "pointer", fontFamily: "monospace", fontSize: 14, fontWeight: 700, color, transition: "border-color 0.15s" }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = color)}
      onMouseLeave={e => (e.currentTarget.style.borderColor = lightColor)}
    >
      {fmtR(value)} <Pencil size={10} strokeWidth={2} style={{ opacity: 0.45 }} />
    </button>
  );
}

// ─── Single bus-type matrix table ─────────────────────────────────────────────

function BusTypeTable({ bt, onChange }: {
  bt: BusTypeMatrix;
  onChange: (level: 1|2|3, road: RoadType, value: number) => void;
}) {
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden" }}>
      {/* Column headers */}
      <div style={{ display: "grid", gridTemplateColumns: "180px 1fr 1fr", background: "var(--background)", borderBottom: "1px solid var(--border)" }}>
        <div style={{ padding: "12px 16px", fontSize: 11, fontWeight: 700, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Level</div>
        {ROAD_TYPES.map(rt => (
          <div key={rt.key} style={{ padding: "12px 16px", borderLeft: "1px solid var(--border)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <span style={{ width: 9, height: 9, borderRadius: "50%", background: rt.dot, display: "inline-block" }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: rt.color }}>{rt.label}</span>
            </div>
            <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 1 }}>ETB per km</div>
          </div>
        ))}
      </div>

      {/* Level rows */}
      {LEVEL_META.map((lv, i) => {
        const rates  = bt.levels[lv.id];
        const lColor = LEVEL_COLORS[i];
        const lLight = LEVEL_LIGHTS[i];
        return (
          <div key={lv.id} style={{ display: "grid", gridTemplateColumns: "180px 1fr 1fr", borderBottom: i < 2 ? "1px solid var(--border)" : "none" }}>
            {/* Level label */}
            <div style={{ padding: "18px 16px", display: "flex", alignItems: "center", gap: 11 }}>
              <div style={{ width: 36, height: 36, borderRadius: 9, background: lLight, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: lColor }}>L{lv.id}</span>
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--foreground)" }}>{lv.label}</div>
                <div style={{ fontSize: 11, color: "var(--muted-foreground)" }}>{lv.desc}</div>
              </div>
            </div>
            {/* Asphalt */}
            <div style={{ padding: "18px 16px", borderLeft: "1px solid var(--border)", display: "flex", alignItems: "center" }}>
              <RateCell value={rates.asphaltRate} color={lColor} lightColor={lLight}
                onChange={v => onChange(lv.id, "asphalt", v)} />
            </div>
            {/* Gravel */}
            <div style={{ padding: "18px 16px", borderLeft: "1px solid var(--border)", display: "flex", alignItems: "center" }}>
              <RateCell value={rates.gravelRate} color="#d97706" lightColor="#fef3c7"
                onChange={v => onChange(lv.id, "gravel", v)} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Rate comparison bars (per active bus type) ───────────────────────────────

function ComparisonBars({ bt }: { bt: BusTypeMatrix }) {
  const allRates = LEVEL_META.flatMap(lv => [bt.levels[lv.id].asphaltRate, bt.levels[lv.id].gravelRate]);
  const maxRate  = Math.max(...allRates);

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "20px 22px" }}>
      <p style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--muted-foreground)", margin: "0 0 16px" }}>Rate comparison — {bt.label}</p>
      {LEVEL_META.map((lv, i) => {
        const rates  = bt.levels[lv.id];
        const lColor = LEVEL_COLORS[i];
        const lLight = LEVEL_LIGHTS[i];
        return (
          <div key={lv.id} style={{ marginBottom: i < 2 ? 16 : 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--foreground)" }}>{lv.label}</span>
              <span style={{ fontSize: 10, color: lColor, background: lLight, padding: "1px 7px", borderRadius: 999, fontWeight: 600 }}>{lv.desc}</span>
            </div>
            {/* Asphalt bar */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
              <span style={{ fontSize: 10, color: "var(--muted-foreground)", width: 52, textAlign: "right", flexShrink: 0 }}>Asphalt</span>
              <div style={{ flex: 1, height: 20, background: "var(--background)", borderRadius: 5, overflow: "hidden" }}>
                <div style={{ height: "100%", borderRadius: 5, background: `linear-gradient(90deg, ${lColor}bb, ${lColor})`, width: `${(rates.asphaltRate / maxRate) * 100}%`, transition: "width 0.4s ease", display: "flex", alignItems: "center", paddingLeft: 8 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: "#fff", fontFamily: "monospace", whiteSpace: "nowrap" }}>{fmtR(rates.asphaltRate)} ETB/km</span>
                </div>
              </div>
            </div>
            {/* Gravel bar */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 10, color: "var(--muted-foreground)", width: 52, textAlign: "right", flexShrink: 0 }}>Gravel</span>
              <div style={{ flex: 1, height: 20, background: "var(--background)", borderRadius: 5, overflow: "hidden" }}>
                <div style={{ height: "100%", borderRadius: 5, background: "linear-gradient(90deg, #d9770688, #d97706)", width: `${(rates.gravelRate / maxRate) * 100}%`, transition: "width 0.4s ease", display: "flex", alignItems: "center", paddingLeft: 8 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: "#fff", fontFamily: "monospace", whiteSpace: "nowrap" }}>{fmtR(rates.gravelRate)} ETB/km</span>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Fare calculator (cross-type, cross-level) ────────────────────────────────

function FareCalculator({ matrix }: { matrix: BusTypeMatrix[] }) {
  const [asphalt, setAsphalt] = useState("");
  const [gravel,  setGravel]  = useState("");

  const akm = parseFloat(asphalt) || 0;
  const gkm = parseFloat(gravel)  || 0;
  const has  = akm > 0 || gkm > 0;

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: "22px 26px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: "#dbeafe", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Calculator size={16} color="#2563eb" />
        </div>
        <div>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: "var(--foreground)", margin: 0 }}>Fare calculator</h2>
          <p style={{ fontSize: 11, color: "var(--muted-foreground)", margin: 0 }}>Preview all 9 fares (3 types × 3 levels) for a mixed-road trip</p>
        </div>
      </div>

      {/* Distance inputs */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
        {[
          { label: "Asphalt distance", val: asphalt, set: setAsphalt, accent: "#0f172a", bg: "#f1f5f9" },
          { label: "Gravel distance",  val: gravel,  set: setGravel,  accent: "#d97706", bg: "#fef3c7" },
        ].map(f => (
          <div key={f.label}>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--muted-foreground)", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.05em" }}>{f.label}</label>
            <div style={{ display: "flex", alignItems: "center", border: `1.5px solid ${f.val ? f.accent : "var(--border)"}`, borderRadius: 9, overflow: "hidden", background: "var(--surface)", transition: "border-color 0.15s" }}>
              <input type="number" min={0} placeholder="0" value={f.val} onChange={e => f.set(e.target.value)}
                style={{ flex: 1, height: 40, padding: "0 11px", border: "none", outline: "none", background: "transparent", fontSize: 15, fontWeight: 700, color: "var(--foreground)", fontFamily: "monospace" }} />
              <span style={{ padding: "0 11px", fontSize: 11, fontWeight: 600, color: "var(--muted-foreground)", borderLeft: "1px solid var(--border)", height: "100%", display: "flex", alignItems: "center" }}>km</span>
            </div>
          </div>
        ))}
      </div>

      {/* Results grid: row = bus type, col = level */}
      {has ? (
        <div style={{ overflowX: "auto" }}>
          {/* Column header */}
          <div style={{ display: "grid", gridTemplateColumns: "110px repeat(3, 1fr)", gap: 8, marginBottom: 8 }}>
            <div />
            {LEVEL_META.map((lv, i) => (
              <div key={lv.id} style={{ textAlign: "center", fontSize: 11, fontWeight: 700, color: LEVEL_COLORS[i], background: LEVEL_LIGHTS[i], borderRadius: 7, padding: "4px 0" }}>
                {lv.label} · {lv.desc}
              </div>
            ))}
          </div>
          {/* Rows */}
          {matrix.map(bt => (
            <div key={bt.id} style={{ display: "grid", gridTemplateColumns: "110px repeat(3, 1fr)", gap: 8, marginBottom: 8, alignItems: "center" }}>
              {/* Bus type label */}
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{ fontSize: 18 }}>{bt.icon}</span>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: bt.color }}>{bt.label}</div>
                  <div style={{ fontSize: 10, color: "var(--muted-foreground)" }}>{bt.description}</div>
                </div>
              </div>
              {/* Fare cells */}
              {LEVEL_META.map((lv, i) => {
                const rates = bt.levels[lv.id];
                const fare  = calcFare(rates, akm, gkm);
                const lColor = LEVEL_COLORS[i];
                const lLight = LEVEL_LIGHTS[i];
                return (
                  <div key={lv.id} style={{ background: lLight, borderRadius: 9, padding: "10px 12px", border: `1px solid ${lColor}22` }}>
                    {akm > 0 && <div style={{ fontSize: 10, color: lColor, opacity: 0.7 }}>{fmt(rates.asphaltRate * akm)} asp.</div>}
                    {gkm > 0 && <div style={{ fontSize: 10, color: "#d97706", opacity: 0.85 }}>+ {fmt(rates.gravelRate * gkm)} grv.</div>}
                    <div style={{ fontSize: 16, fontWeight: 800, color: lColor, fontFamily: "monospace", marginTop: 3 }}>
                      {fmt(fare)} <span style={{ fontSize: 10, fontWeight: 600 }}>ETB</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      ) : (
        <div style={{ padding: "16px 0", textAlign: "center", color: "var(--muted-foreground)", fontSize: 13, fontStyle: "italic" }}>
          Enter distances above to see all 9 fares at once.
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function FarePriceMatrixPage() {
  const [matrix,     setMatrix]     = useState<BusTypeMatrix[]>([]);
  const [activeType, setActiveType] = useState<BusTypeId>("bus");
  const [saved,      setSaved]      = useState(false);
  const [changed,    setChanged]    = useState(false);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);

  const loadMatrix = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ matrix: Record<string, Record<string, { asphaltRate: number; gravelRate: number }>> }>("/api/fare-matrix");
      setMatrix(buildMatrixFromAPI(res.matrix));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load fare matrix.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadMatrix(); }, [loadMatrix]);

  const activeBT = matrix.find(bt => bt.id === activeType) ?? matrix[0] ?? {
    ...BUS_TYPE_META[0],
    levels: { 1: { asphaltRate: 0, gravelRate: 0 }, 2: { asphaltRate: 0, gravelRate: 0 }, 3: { asphaltRate: 0, gravelRate: 0 } },
  };

  function updateRate(btId: BusTypeId, level: 1|2|3, road: RoadType, value: number) {
    setMatrix(prev => prev.map(bt =>
      bt.id === btId
        ? { ...bt, levels: { ...bt.levels, [level]: { ...bt.levels[level], [road === "asphalt" ? "asphaltRate" : "gravelRate"]: value } } }
        : bt
    ));
    setChanged(true);
    setSaved(false);
  }

  async function handleSave() {
    try {
      await apiFetch("/api/fare-matrix", {
        method: "PUT",
        body: JSON.stringify({ rows: buildRowsFromMatrix(matrix) }),
      });
      setSaved(true);
      setChanged(false);
      setTimeout(() => setSaved(false), 2400);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save matrix.");
    }
  }

  async function handleReset() {
    await loadMatrix();
    setChanged(false);
    setSaved(false);
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--background)", padding: "32px 36px" }}>

      {/* ── Page header ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--foreground)", margin: 0 }}>Fare Price Matrix</h1>
          <p style={{ fontSize: 13, color: "var(--muted-foreground)", margin: "4px 0 0" }}>
            3 bus types · 3 levels · asphalt &amp; gravel · 18 rates total
            &nbsp;·&nbsp; Fare = (A km × rate) + (G km × rate)
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {changed && (
            <button onClick={handleReset} style={{ height: 38, padding: "0 16px", borderRadius: 9, border: "1.5px solid var(--border)", background: "var(--surface)", fontSize: 13, cursor: "pointer", color: "var(--muted-foreground)", display: "flex", alignItems: "center", gap: 6 }}>
              <RefreshCw size={13} /> Reset
            </button>
          )}
          <button onClick={handleSave} style={{ height: 38, padding: "0 20px", borderRadius: 9, border: "none", background: saved ? "#16a34a" : "var(--primary)", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, transition: "background 0.2s" }}>
            {saved ? <><Check size={14} strokeWidth={2.5} /> Saved</> : "Save matrix"}
          </button>
        </div>
      </div>

      {loading && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "40px 0", color: "var(--muted-foreground)", fontSize: 13 }}>
          <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} /> Loading fare matrix…
        </div>
      )}

      {error && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", background: "#fee2e2", borderRadius: 10, color: "#b91c1c", fontSize: 13, marginBottom: 20 }}>
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {!loading && !error && matrix.length === 0 && (
        <div style={{ padding: "60px 0", textAlign: "center", color: "var(--muted-foreground)", fontSize: 14 }}>
          No fare matrix data found.
        </div>
      )}

      {/* ── Summary chips — quick glance at all 18 rates ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 28 }}>
        {matrix.map(bt => (
          <div key={bt.id} style={{ background: "var(--surface)", border: `1.5px solid ${bt.color}33`, borderRadius: 14, padding: "16px 18px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 12 }}>
              <span style={{ fontSize: 22 }}>{bt.icon}</span>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: bt.color }}>{bt.label}</div>
                <div style={{ fontSize: 11, color: "var(--muted-foreground)" }}>{bt.description}</div>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "auto 1fr 1fr", gap: "5px 10px", alignItems: "center" }}>
              {/* header row */}
              <div />
              <div style={{ fontSize: 10, fontWeight: 700, color: "#0f172a", textAlign: "center" }}>Asphalt</div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#d97706", textAlign: "center" }}>Gravel</div>
              {/* level rows */}
              {LEVEL_META.map((lv, i) => (
                <>
                  <div key={`l-${lv.id}`} style={{ fontSize: 10, fontWeight: 600, color: LEVEL_COLORS[i], background: LEVEL_LIGHTS[i], padding: "1px 6px", borderRadius: 5 }}>L{lv.id}</div>
                  <div key={`a-${lv.id}`} style={{ fontSize: 12, fontWeight: 700, fontFamily: "monospace", color: "var(--foreground)", textAlign: "center" }}>{fmtR(bt.levels[lv.id].asphaltRate)}</div>
                  <div key={`g-${lv.id}`} style={{ fontSize: 12, fontWeight: 700, fontFamily: "monospace", color: "#d97706", textAlign: "center" }}>{fmtR(bt.levels[lv.id].gravelRate)}</div>
                </>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* ── Bus type tabs ── */}
      <div style={{ display: "flex", gap: 0, marginBottom: 20, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 5, width: "fit-content" }}>
        {matrix.map(bt => {
          const active = activeType === bt.id;
          return (
            <button key={bt.id} onClick={() => setActiveType(bt.id)} style={{
              height: 38, padding: "0 20px", borderRadius: 9, border: "none",
              background: active ? bt.color : "transparent",
              color: active ? "#fff" : "var(--muted-foreground)",
              fontSize: 13, fontWeight: active ? 700 : 500,
              cursor: "pointer", display: "flex", alignItems: "center", gap: 7,
              transition: "background 0.15s, color 0.15s",
            }}>
              <span style={{ fontSize: 16 }}>{bt.icon}</span>
              {bt.label}
            </button>
          );
        })}
      </div>

      {/* ── Active type: matrix + bars side by side ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 16, marginBottom: 24 }}>
        <BusTypeTable
          bt={activeBT}
          onChange={(level, road, value) => updateRate(activeBT.id, level, road, value)}
        />
        <ComparisonBars bt={activeBT} />
      </div>

      {/* ── Cross-type calculator ── */}
      <FareCalculator matrix={matrix} />

      {/* ── Info note ── */}
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginTop: 20, padding: "13px 16px", background: "var(--background)", border: "1px solid var(--border)", borderRadius: 11 }}>
        <Info size={14} color="var(--muted-foreground)" style={{ flexShrink: 0, marginTop: 1 }} />
        <p style={{ fontSize: 12, color: "var(--muted-foreground)", margin: 0, lineHeight: 1.7 }}>
          <strong style={{ color: "var(--foreground)" }}>Formula:</strong> Total fare = (Asphalt km × level rate) + (Gravel km × level rate).
          Click any rate in the matrix to edit inline — Enter to confirm, Escape to cancel.
          Changes are not applied to live routes until you click <strong style={{ color: "var(--foreground)" }}>Save matrix</strong>.
        </p>
      </div>
    </div>
  );
}