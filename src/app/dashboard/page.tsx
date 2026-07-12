"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle, MapPin, Users, Monitor,
  Wallet, TrendingUp, ChevronRight, ArrowUpRight,
  Banknote, ShieldAlert, Zap, BarChart3, RefreshCw,
  CheckCircle2,
} from "lucide-react";
import { dateToEthiopian, dateToEthiopianTime, formatEthiopianDate, formatEthiopianTime } from "@/lib/ethiopian-calendar";

// ─── Types (mirror the /api/report response shapes we use) ───────────────────

type StationRow = {
  id: string; name: string; region: string; zone: string;
  terminalCount: number; employeeCount: number; posMachineCount: number;
  supervisorCount: number; activePosCount: number;
  monthlySalary: number; totalPettyCash: number;
};

type PosRow = {
  id: string; serial: string; make: string; model: string;
  status: "ACTIVE" | "IDLE" | "MAINTENANCE" | "DECOMMISSIONED";
  appVersion: string; isUpToDate: boolean | null;
  stationId: string | null; stationName: string | null;
  employeeId: string | null;
};

type StaffRow = {
  id: string; fullName: string; role: "SUPERVISOR" | "TICKETER" | "CASHIER";
  stationId: string | null; stationName: string | null; basicSalary: number;
};

type PettyCashRow = {
  id: string; employeeName: string; station: string;
  amount: number; date: string; method: string;
};

type PettyCashSummary = {
  totalDisbursed: number;
  byEmployee: { employeeId: string; name: string; station: string; total: number }[];
};

type StaffSummary = {
  totalEmployees: number;
  byRole: { SUPERVISOR: number; TICKETER: number; CASHIER: number };
  withPOS: number; withoutPOS: number;
  totalSalary: number;
};

type PosSummary = {
  total: number;
  byStatus: { ACTIVE: number; IDLE: number; MAINTENANCE: number; DECOMMISSIONED: number };
  outdated: number | null; unassigned: number;
};

type StationSummaryTotals = { totalStations: number };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d: Date) {
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}
function fmtTime(d: Date) {
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
function fmtCurrency(n: number) {
  return n.toLocaleString("en-ET", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(path);
  const json = await res.json();
  if (!res.ok) throw new Error(json?.message ?? json?.error ?? `Request failed: ${res.status}`);
  return json as T;
}

// ─── Shared UI atoms ──────────────────────────────────────────────────────────

function StatCard({ icon, label, value, sub, color, lightColor }: {
  icon: React.ReactNode; label: string; value: string | number;
  sub?: string; color: string; lightColor: string;
}) {
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "18px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ width: 38, height: 38, borderRadius: 10, background: lightColor, display: "flex", alignItems: "center", justifyContent: "center", color, flexShrink: 0 }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 26, fontWeight: 800, color: "var(--foreground)", fontFamily: "monospace", lineHeight: 1 }}>{value}</div>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)", marginTop: 4 }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  );
}

function SectionHeader({ title, sub, action }: { title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
      <div>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--foreground)", margin: 0 }}>{title}</h2>
        {sub && <p style={{ fontSize: 12, color: "var(--muted-foreground)", margin: "2px 0 0" }}>{sub}</p>}
      </div>
      {action}
    </div>
  );
}

function NavLink({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} style={{ fontSize: 12, fontWeight: 600, color: "var(--primary)", textDecoration: "none", display: "flex", alignItems: "center", gap: 3 }}>
      {label} <ChevronRight size={12} />
    </a>
  );
}

// ─── POS donut (pure SVG) ────────────────────────────────────────────────────

function POSDonut({ byStatus }: { byStatus: PosSummary["byStatus"] }) {
  const slices = [
    { label: "Active",      count: byStatus.ACTIVE,      color: "#16a34a" },
    { label: "Idle",        count: byStatus.IDLE,        color: "#d97706" },
    { label: "Maintenance", count: byStatus.MAINTENANCE, color: "#dc2626" },
  ];
  const total = slices.reduce((s, x) => s + x.count, 0);
  const R = 44; const cx = 56; const cy = 56; const stroke = 14;
  let cumAngle = -90;

  function arc(pct: number, color: string, startAngle: number) {
    if (pct === 0) return null;
    if (pct === 1) pct = 0.9999;
    const end  = startAngle + pct * 360;
    const r    = R;
    const toRad = (a: number) => (a * Math.PI) / 180;
    const x1 = cx + r * Math.cos(toRad(startAngle));
    const y1 = cy + r * Math.sin(toRad(startAngle));
    const x2 = cx + r * Math.cos(toRad(end));
    const y2 = cy + r * Math.sin(toRad(end));
    const large = pct > 0.5 ? 1 : 0;
    return <path key={color} d={`M${x1},${y1} A${r},${r} 0 ${large},1 ${x2},${y2}`} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="butt" />;
  }

  const paths = slices.map(s => {
    const pct = total > 0 ? s.count / total : 0;
    const p = arc(pct, s.color, cumAngle);
    cumAngle += pct * 360;
    return p;
  });

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
      <svg width={112} height={112}>
        <circle cx={cx} cy={cy} r={R} fill="none" stroke="var(--background)" strokeWidth={stroke} />
        {paths}
        <text x={cx} y={cy - 6} textAnchor="middle" style={{ fontSize: 18, fontWeight: 800, fill: "var(--foreground)", fontFamily: "monospace" }}>{total}</text>
        <text x={cx} y={cy + 10} textAnchor="middle" style={{ fontSize: 9, fill: "var(--muted-foreground)", fontFamily: "inherit" }}>machines</text>
      </svg>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {slices.map(s => (
          <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: s.color, flexShrink: 0, display: "inline-block" }} />
            <span style={{ fontSize: 12, color: "var(--muted-foreground)", width: 90 }}>{s.label}</span>
            <span style={{ fontSize: 13, fontWeight: 700, fontFamily: "monospace", color: "var(--foreground)" }}>{s.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Role breakdown bar ───────────────────────────────────────────────────────

function RoleBar({ byRole }: { byRole: StaffSummary["byRole"] }) {
  const roles = [
    { label: "Supervisor", count: byRole.SUPERVISOR, color: "#7c3aed" },
    { label: "Ticketer",   count: byRole.TICKETER,   color: "#2563eb" },
    { label: "Cashier",    count: byRole.CASHIER,    color: "#d97706" },
  ];
  const total = roles.reduce((s, r) => s + r.count, 0) || 1;
  return (
    <div>
      <div style={{ display: "flex", height: 10, borderRadius: 999, overflow: "hidden", gap: 1, marginBottom: 10 }}>
        {roles.map(r => (
          <div key={r.label} style={{ flex: r.count / total, background: r.color, minWidth: r.count > 0 ? 4 : 0 }} />
        ))}
      </div>
      <div style={{ display: "flex", gap: 14 }}>
        {roles.map(r => (
          <div key={r.label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: r.color, display: "inline-block", flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>{r.label}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--foreground)", fontFamily: "monospace" }}>{r.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Alert severity styling ───────────────────────────────────────────────────

const alertStyle = {
  critical: { bg: "#fef2f2", border: "#fecaca", icon: "#dc2626", dot: "#dc2626" },
  warning:  { bg: "#fffbeb", border: "#fde68a", icon: "#d97706", dot: "#d97706" },
  info:     { bg: "#eff6ff", border: "#bfdbfe", icon: "#2563eb", dot: "#2563eb" },
};

type Alert = { id: string; severity: "critical" | "warning" | "info"; message: string; detail: string; link: string };
type StationHealth = StationRow & { issues: string[]; health: "good" | "warning" | "critical"; staff: StaffRow[] };

// ─── Main dashboard ───────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [alertsExpanded, setAlertsExpanded] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const [stations,  setStations]  = useState<StationRow[]>([]);
  const [posRows,    setPosRows]    = useState<PosRow[]>([]);
  const [posSummary, setPosSummary] = useState<PosSummary | null>(null);
  const [staffRows,  setStaffRows]  = useState<StaffRow[]>([]);
  const [staffSummary, setStaffSummary] = useState<StaffSummary | null>(null);
  const [pettyCashRows, setPettyCashRows] = useState<PettyCashRow[]>([]);
  const [pettyCashSummary, setPettyCashSummary] = useState<PettyCashSummary | null>(null);

  async function load() {
    setLoading(true); setError(null);
    try {
      const [stationRes, posRes, staffRes, pettyRes] = await Promise.all([
        apiFetch<{ data: StationRow[]; summary: StationSummaryTotals }>("/api/report?type=station-summary"),
        apiFetch<{ data: PosRow[]; summary: PosSummary }>("/api/report?type=pos-fleet"),
        apiFetch<{ data: StaffRow[]; summary: StaffSummary }>("/api/report?type=staff-roster"),
        apiFetch<{ data: PettyCashRow[]; summary: PettyCashSummary }>("/api/report?type=petty-cash-ledger"),
      ]);
      setStations(stationRes.data);
      setPosRows(posRes.data);
      setPosSummary(posRes.summary);
      setStaffRows(staffRes.data);
      setStaffSummary(staffRes.summary);
      setPettyCashRows(pettyRes.data);
      setPettyCashSummary(pettyRes.summary);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load dashboard data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  if (loading) {
    return (
      <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted-foreground)" }}>
        <RefreshCw size={18} style={{ marginRight: 8, animation: "spin 1s linear infinite" }} /> Loading dashboard…
      </div>
    );
  }

  if (error || !posSummary || !staffSummary || !pettyCashSummary) {
    return (
      <div style={{ minHeight: "60vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10 }}>
        <AlertTriangle size={28} color="#dc2626" />
        <p style={{ fontSize: 13, color: "#dc2626" }}>{error ?? "Failed to load dashboard data."}</p>
        <button onClick={load} style={{ height: 34, padding: "0 14px", borderRadius: 8, border: "1.5px solid var(--border)", background: "var(--surface)", cursor: "pointer", fontSize: 12, fontWeight: 600, color: "var(--foreground)", display: "flex", alignItems: "center", gap: 6 }}>
          <RefreshCw size={13} /> Retry
        </button>
      </div>
    );
  }

  // ── Derived data ────────────────────────────────────────────────────────────

  const outdatedPOS   = posRows.filter(p => p.isUpToDate === false);
  const unassignedPOS = posRows.filter(p => !p.employeeId && p.status !== "MAINTENANCE" && p.status !== "DECOMMISSIONED");

  const stationHealth: StationHealth[] = stations.map(st => {
    const staff = staffRows.filter(e => e.stationId === st.id);
    const stationOutdated = posRows.some(p => p.stationId === st.id && p.isUpToDate === false);
    const issues: string[] = [];
    if (st.employeeCount === 0) issues.push("No staff assigned");
    if (st.posMachineCount > 0 && st.activePosCount === 0) issues.push("No active POS");
    if (stationOutdated) issues.push("POS needs update");
    const health = issues.length === 0 ? "good" : issues.length === 1 ? "warning" : "critical";
    return { ...st, staff, issues, health };
  });

  const ALERTS: Alert[] = [
    ...outdatedPOS.map(p => ({
      id: `outdated-${p.id}`, severity: "warning" as const,
      message: `${p.serial} is running ${p.appVersion}`,
      detail: `Station: ${p.stationName ?? "—"}`,
      link: "/dashboard/pos-machines",
    })),
    ...unassignedPOS.map(p => ({
      id: `unassigned-${p.id}`, severity: "info" as const,
      message: `${p.serial} is unassigned`,
      detail: `${p.make} ${p.model} · Status: ${p.status}`,
      link: "/dashboard/pos-machines",
    })),
    ...stationHealth.filter(s => s.issues.length > 0).map(s => ({
      id: `station-${s.id}`, severity: s.health === "critical" ? "critical" as const : "warning" as const,
      message: `${s.name} has ${s.issues.length} issue${s.issues.length > 1 ? "s" : ""}`,
      detail: s.issues.join(" · "),
      link: "/dashboard/stations",
    })),
  ];

  const appVersionCounts = new Map<string, { count: number; isUpToDate: boolean | null }>();
  for (const p of posRows) {
    const entry = appVersionCounts.get(p.appVersion) ?? { count: 0, isUpToDate: p.isUpToDate };
    entry.count += 1;
    appVersionCounts.set(p.appVersion, entry);
  }

  const recentPettyCash = [...pettyCashRows].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);

  return (
    <>
      <style>{`
        * { box-sizing: border-box; }
        a { text-decoration: none; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      <div style={{ minHeight: "100vh", background: "var(--background)", padding: "28px 32px 48px" }}>

        {/* ── Header ── */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 }}>
          <div>
            <p style={{ fontSize: 12, fontWeight: 600, color: "var(--primary)", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 4px" }}>
              OroDashboard
            </p>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: "var(--foreground)", margin: 0 }}>Operations Dashboard</h1>
            {now && (
              <>
                <p style={{ fontSize: 13, color: "var(--muted-foreground)", margin: "5px 0 0", display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#16a34a", display: "inline-block", animation: "pulse 2s infinite" }} />
                  {fmtDate(now)} · {fmtTime(now)}
                </p>
                <p style={{ fontSize: 12, color: "var(--muted-foreground)", margin: "3px 0 0 15px" }}>
                  {formatEthiopianDate(dateToEthiopian(now))} (E.C.) · {formatEthiopianTime(dateToEthiopianTime(now))}
                </p>
              </>
            )}
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <a href="/dashboard/reports" style={{ height: 38, padding: "0 16px", borderRadius: 9, border: "1.5px solid var(--border)", background: "var(--surface)", fontSize: 13, fontWeight: 600, color: "var(--foreground)", display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
              <BarChart3 size={15} /> Reports
            </a>
          </div>
        </div>

        {/* ── ALERTS ── */}
        {ALERTS.length > 0 ? (
          <div style={{ marginBottom: 28 }}>
            <button
              onClick={() => setAlertsExpanded(v => !v)}
              style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderRadius: alertsExpanded ? "12px 12px 0 0" : 12, border: "1px solid #fde68a", background: "#fffbeb", cursor: "pointer", marginBottom: 0 }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <ShieldAlert size={16} color="#d97706" />
                <span style={{ fontSize: 14, fontWeight: 700, color: "#92400e" }}>
                  {ALERTS.length} item{ALERTS.length > 1 ? "s" : ""} need{ALERTS.length === 1 ? "s" : ""} attention
                </span>
                {ALERTS.filter(a => a.severity === "critical").length > 0 && (
                  <span style={{ fontSize: 11, fontWeight: 700, background: "#dc2626", color: "#fff", padding: "1px 7px", borderRadius: 999 }}>
                    {ALERTS.filter(a => a.severity === "critical").length} critical
                  </span>
                )}
              </div>
              <span style={{ fontSize: 12, color: "#d97706", fontWeight: 600 }}>{alertsExpanded ? "Collapse ↑" : "Expand ↓"}</span>
            </button>

            {alertsExpanded && (
              <div style={{ border: "1px solid #fde68a", borderTop: "none", borderRadius: "0 0 12px 12px", overflow: "hidden" }}>
                {ALERTS.map((alert, i) => {
                  const s = alertStyle[alert.severity];
                  return (
                    <div key={alert.id} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "11px 16px", background: s.bg, borderTop: i > 0 ? `1px solid ${s.border}` : "none" }}>
                      <span style={{ width: 7, height: 7, borderRadius: "50%", background: s.dot, flexShrink: 0, marginTop: 5 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)" }}>{alert.message}</span>
                        <span style={{ fontSize: 12, color: "var(--muted-foreground)", marginLeft: 8 }}>{alert.detail}</span>
                      </div>
                      <a href={alert.link} style={{ fontSize: 11, fontWeight: 700, color: s.icon, whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 3 }}>
                        Fix <ArrowUpRight size={11} />
                      </a>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div style={{ marginBottom: 28, display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderRadius: 12, border: "1px solid #bbf7d0", background: "#f0fdf4" }}>
            <CheckCircle2 size={16} color="#16a34a" />
            <span style={{ fontSize: 13, fontWeight: 600, color: "#166534" }}>No issues need attention right now.</span>
          </div>
        )}

        {/* ── KPI STRIP ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 28 }}>
          <StatCard icon={<MapPin size={18} />}  label="Stations"       value={stations.length}   sub="All regions"                             color="#2563eb" lightColor="#dbeafe" />
          <StatCard icon={<Users size={18} />}    label="Employees"      value={staffSummary.totalEmployees}  sub={`${staffSummary.withPOS} with POS assigned`}  color="#7c3aed" lightColor="#ede9fe" />
          <StatCard icon={<Monitor size={18} />}  label="POS Machines"   value={posSummary.total}        sub={`${posSummary.byStatus.ACTIVE} active · ${posSummary.byStatus.IDLE} idle`} color="#16a34a" lightColor="#dcfce7" />
          <StatCard icon={<Banknote size={18} />} label="Monthly Salary" value={`${fmtCurrency(staffSummary.totalSalary)} ETB`} sub={`${staffSummary.totalEmployees} employees`} color="#d97706" lightColor="#fef3c7" />
        </div>

        {/* ── ROW 2: Financial + Staff + Fleet ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 28 }}>

          {/* Financial summary */}
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "20px 22px" }}>
            <SectionHeader title="Financials" sub="Salary & petty cash" action={<NavLink href="/dashboard/reports" label="Full report" />} />
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {[
                { label: "Total salary bill",     value: `${fmtCurrency(staffSummary.totalSalary)} ETB`,     color: "#d97706", icon: <Banknote size={13} /> },
                { label: "Total petty cash out",  value: `${fmtCurrency(pettyCashSummary.totalDisbursed)} ETB`,  color: "#dc2626", icon: <Wallet size={13} />   },
                { label: "Avg salary / employee", value: `${fmtCurrency(staffSummary.totalEmployees ? staffSummary.totalSalary / staffSummary.totalEmployees : 0)} ETB`, color: "#7c3aed", icon: <TrendingUp size={13} /> },
              ].map(row => (
                <div key={row.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", background: "var(--background)", borderRadius: 9, border: "1px solid var(--border)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--muted-foreground)", fontSize: 12 }}>
                    <span style={{ color: row.color }}>{row.icon}</span>
                    {row.label}
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 800, color: row.color, fontFamily: "monospace" }}>{row.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Staff breakdown */}
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "20px 22px" }}>
            <SectionHeader title="Staff" sub={`${staffSummary.totalEmployees} employees on file`} action={<NavLink href="/dashboard/employees" label="View all" />} />

            {/* POS assignment chips */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
              <div style={{ padding: "10px 12px", borderRadius: 9, background: "#dcfce7", border: "1px solid #bbf7d0", display: "flex", alignItems: "center", gap: 7 }}>
                <Monitor size={14} color="#16a34a" />
                <div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: "#16a34a", fontFamily: "monospace" }}>{staffSummary.withPOS}</div>
                  <div style={{ fontSize: 10, color: "#16a34a", fontWeight: 600 }}>With POS</div>
                </div>
              </div>
              <div style={{ padding: "10px 12px", borderRadius: 9, background: "#f1f5f9", border: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 7 }}>
                <Monitor size={14} color="#64748b" />
                <div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: "#64748b", fontFamily: "monospace" }}>{staffSummary.withoutPOS}</div>
                  <div style={{ fontSize: 10, color: "#64748b", fontWeight: 600 }}>Without POS</div>
                </div>
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>By role</p>
              <RoleBar byRole={staffSummary.byRole} />
            </div>

            {/* Petty cash by supervisor */}
            <p style={{ fontSize: 11, fontWeight: 700, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Petty cash — supervisors</p>
            {pettyCashSummary.byEmployee.length === 0 && (
              <p style={{ fontSize: 12, color: "var(--muted-foreground)" }}>No petty cash disbursed yet.</p>
            )}
            {pettyCashSummary.byEmployee.map(sup => (
              <div key={sup.employeeId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#ede9fe", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: "#7c3aed" }}>{sup.name.charAt(0)}</span>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--foreground)" }}>{sup.name}</div>
                    <div style={{ fontSize: 11, color: "var(--muted-foreground)" }}>{sup.station}</div>
                  </div>
                </div>
                <span style={{ fontSize: 13, fontWeight: 800, color: "#7c3aed", fontFamily: "monospace" }}>{fmtCurrency(sup.total)} ETB</span>
              </div>
            ))}
          </div>

          {/* POS fleet */}
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "20px 22px" }}>
            <SectionHeader title="POS Fleet" sub={`${posSummary.total} machines across ${stations.length} stations`} action={<NavLink href="/dashboard/pos-machines" label="Manage" />} />
            <POSDonut byStatus={posSummary.byStatus} />

            <div style={{ marginTop: 18 }}>
              {/* App version summary */}
              <p style={{ fontSize: 11, fontWeight: 700, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>App versions</p>
              {[...appVersionCounts.entries()].map(([version, info]) => (
                <div key={version} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: "1px solid var(--border)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: info.isUpToDate ? "#16a34a" : "#d97706", display: "inline-block", flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: "var(--foreground)", fontFamily: "monospace" }}>{version}</span>
                    {info.isUpToDate && <span style={{ fontSize: 10, fontWeight: 700, color: "#16a34a", background: "#dcfce7", padding: "1px 6px", borderRadius: 999 }}>latest</span>}
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 700, fontFamily: "monospace", color: info.isUpToDate ? "#16a34a" : "#d97706" }}>{info.count} machine{info.count > 1 ? "s" : ""}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── STATION HEALTH CARDS ── */}
        <div style={{ marginBottom: 28 }}>
          <SectionHeader
            title="Station health"
            sub="Live status per station — staff, POS, and open issues"
            action={<NavLink href="/dashboard/stations" label="Manage stations" />}
          />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
            {stationHealth.map(st => {
              const healthColor = st.health === "good" ? "#16a34a" : st.health === "warning" ? "#d97706" : "#dc2626";
              const healthBg    = st.health === "good" ? "#dcfce7" : st.health === "warning" ? "#fef3c7" : "#fee2e2";
              const healthLabel = st.health === "good" ? "Healthy" : st.health === "warning" ? "Warning" : "Critical";
              return (
                <div key={st.id} style={{ background: "var(--surface)", border: `1px solid var(--border)`, borderRadius: 14, padding: "18px 20px", borderTop: `3px solid ${healthColor}` }}>
                  {/* Station name + health badge */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "var(--foreground)" }}>{st.name}</div>
                      <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 2 }}>{st.region} · {st.zone}</div>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: healthColor, background: healthBg, padding: "3px 9px", borderRadius: 999, flexShrink: 0 }}>
                      {healthLabel}
                    </span>
                  </div>

                  {/* Mini stat row */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: st.issues.length > 0 ? 12 : 0 }}>
                    {[
                      { icon: <Users size={12} />,   label: "Staff",       value: st.employeeCount,   color: "#7c3aed" },
                      { icon: <Monitor size={12} />, label: "POS",         value: st.posMachineCount, color: "#2563eb" },
                      { icon: <Zap size={12} />,     label: "Active POS",  value: st.activePosCount,  color: "#16a34a" },
                    ].map(m => (
                      <div key={m.label} style={{ textAlign: "center", padding: "8px 4px", background: "var(--background)", borderRadius: 8, border: "1px solid var(--border)" }}>
                        <div style={{ color: m.color, display: "flex", justifyContent: "center", marginBottom: 3 }}>{m.icon}</div>
                        <div style={{ fontSize: 16, fontWeight: 800, color: "var(--foreground)", fontFamily: "monospace" }}>{m.value}</div>
                        <div style={{ fontSize: 9, color: "var(--muted-foreground)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>{m.label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Issues list */}
                  {st.issues.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                      {st.issues.map((issue, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 9px", background: healthBg, borderRadius: 7, fontSize: 11, color: healthColor, fontWeight: 500 }}>
                          <AlertTriangle size={11} />
                          {issue}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Staff list (compact) */}
                  {st.staff.length > 0 && (
                    <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
                      {st.staff.slice(0, 3).map(emp => (
                        <div key={emp.id} style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5 }}>
                          <div style={{ width: 22, height: 22, borderRadius: "50%", background: "#ede9fe", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            <span style={{ fontSize: 9, fontWeight: 800, color: "#7c3aed" }}>{emp.fullName.charAt(0)}</span>
                          </div>
                          <span style={{ fontSize: 11, color: "var(--foreground)", fontWeight: 500, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{emp.fullName}</span>
                          <span style={{ fontSize: 10, color: emp.role === "SUPERVISOR" ? "#7c3aed" : emp.role === "CASHIER" ? "#d97706" : "#2563eb", background: emp.role === "SUPERVISOR" ? "#ede9fe" : emp.role === "CASHIER" ? "#fef3c7" : "#dbeafe", padding: "1px 6px", borderRadius: 999, fontWeight: 600, whiteSpace: "nowrap" }}>{emp.role}</span>
                        </div>
                      ))}
                      {st.staff.length > 3 && (
                        <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>+{st.staff.length - 3} more</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── RECENT PETTY CASH + POS TABLE ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>

          {/* Recent petty cash */}
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "20px 22px" }}>
            <SectionHeader title="Recent petty cash" sub="Latest disbursements" action={<NavLink href="/dashboard/reports" label="Full ledger" />} />
            {recentPettyCash.length === 0 ? (
              <p style={{ fontSize: 12, color: "var(--muted-foreground)" }}>No petty cash records yet.</p>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {["Supervisor", "Amount", "Method", "Date"].map(h => (
                      <th key={h} style={{ padding: "6px 8px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid var(--border)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recentPettyCash.map(p => (
                    <tr key={p.id}>
                      <td style={{ padding: "9px 8px", fontSize: 12, color: "var(--foreground)", fontWeight: 500, borderBottom: "1px solid var(--border)" }}>{p.employeeName}</td>
                      <td style={{ padding: "9px 8px", fontSize: 12, fontWeight: 800, color: "#7c3aed", fontFamily: "monospace", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" }}>{fmtCurrency(p.amount)} ETB</td>
                      <td style={{ padding: "9px 8px", fontSize: 11, color: "var(--muted-foreground)", borderBottom: "1px solid var(--border)" }}>{p.method}</td>
                      <td style={{ padding: "9px 8px", fontSize: 11, color: "var(--muted-foreground)", fontFamily: "monospace", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" }}>{new Date(p.date).toLocaleDateString("en-GB")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* POS machine quick table */}
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "20px 22px" }}>
            <SectionHeader title="POS machines" sub="Status at a glance" action={<NavLink href="/dashboard/pos-machines" label="Full fleet" />} />
            {posRows.length === 0 ? (
              <p style={{ fontSize: 12, color: "var(--muted-foreground)" }}>No POS machines registered yet.</p>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {["Serial", "Status", "Station", "Version"].map(h => (
                      <th key={h} style={{ padding: "6px 8px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid var(--border)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {posRows.slice(0, 8).map(p => {
                    const statusColor = p.status === "ACTIVE" ? "#16a34a" : p.status === "IDLE" ? "#d97706" : p.status === "MAINTENANCE" ? "#dc2626" : "#64748b";
                    const statusBg    = p.status === "ACTIVE" ? "#dcfce7" : p.status === "IDLE" ? "#fef3c7" : p.status === "MAINTENANCE" ? "#fee2e2" : "#f1f5f9";
                    return (
                      <tr key={p.id}>
                        <td style={{ padding: "9px 8px", fontSize: 11, fontFamily: "monospace", fontWeight: 600, color: "var(--foreground)", borderBottom: "1px solid var(--border)" }}>{p.serial}</td>
                        <td style={{ padding: "9px 8px", borderBottom: "1px solid var(--border)" }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: statusColor, background: statusBg, padding: "2px 7px", borderRadius: 999 }}>{p.status}</span>
                        </td>
                        <td style={{ padding: "9px 8px", fontSize: 11, color: "var(--muted-foreground)", borderBottom: "1px solid var(--border)", maxWidth: 110, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {p.stationName ?? "—"}
                        </td>
                        <td style={{ padding: "9px 8px", fontSize: 10, borderBottom: "1px solid var(--border)" }}>
                          <span style={{ fontWeight: 700, color: p.isUpToDate === false ? "#d97706" : "#16a34a", background: p.isUpToDate === false ? "#fef3c7" : "#dcfce7", padding: "2px 6px", borderRadius: 999 }}>
                            {p.isUpToDate === false ? "Outdated" : "Latest"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

      </div>
    </>
  );
}
