"use client";

import { useState } from "react";
import {
  AlertTriangle, CheckCircle, MapPin, Users, Monitor,
  Wallet, TrendingUp, Clock, ChevronRight, ArrowUpRight,
  Bus, Activity, Banknote, ShieldAlert, RefreshCw,
  UserCheck, UserX, Zap, BarChart3, CircleDot,
} from "lucide-react";

// ─── Seed data (same shape as the other pages) ───────────────────────────────

const TODAY = new Date();
function daysAgo(iso: string) {
  if (!iso) return null;
  return Math.floor((TODAY.getTime() - new Date(iso).getTime()) / 86400000);
}
function fmtDate(d: Date) {
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}
function fmtCurrency(n: number) {
  return n.toLocaleString("en-ET", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const STATIONS = [
  { id: "STN-001", name: "Meskel Square Terminal", region: "Addis Ababa", zone: "Central" },
  { id: "STN-002", name: "Bole Station",            region: "Addis Ababa", zone: "East"    },
  { id: "STN-003", name: "Piassa Hub",              region: "Addis Ababa", zone: "North"   },
];

const EMPLOYEES = [
  { id: "EMP-001", name: "Abebe Girma",   role: "Supervisor", stationId: "STN-001", salary: 8500,  isWorking: true,  posSerial: "VFN-240M-AA001", employmentDate: "2021-03-15" },
  { id: "EMP-002", name: "Tigist Haile",  role: "Ticketer",   stationId: "STN-001", salary: 6200,  isWorking: false, posSerial: "",               employmentDate: "2022-07-01" },
  { id: "EMP-003", name: "Dawit Tesfaye", role: "Cashier",    stationId: "STN-002", salary: 6200,  isWorking: true,  posSerial: "ING-MV5K-AA003", employmentDate: "2023-01-20" },
  { id: "EMP-004", name: "Sara Kebede",   role: "Supervisor", stationId: "STN-003", salary: 9000,  isWorking: true,  posSerial: "",               employmentDate: "2020-11-05" },
];

const POS_MACHINES = [
  { id: "POS-001", serial: "VFN-240M-AA001", make: "Verifone",       model: "V240m",     status: "Active",      appVersion: "ORO Ticket v2.4.1", stationId: "STN-001", employeeId: "EMP-001", lastAssigned: "2024-03-01" },
  { id: "POS-002", serial: "PAX-A920-AA002", make: "PAX Technology", model: "A920",      status: "Active",      appVersion: "ORO Ticket v2.4.1", stationId: "STN-001", employeeId: "EMP-002", lastAssigned: "2023-06-01" },
  { id: "POS-003", serial: "ING-MV5K-AA003", make: "Ingenico",       model: "Move 5000", status: "Maintenance", appVersion: "ORO Ticket v2.3.8", stationId: "STN-002", employeeId: "",        lastAssigned: "2022-11-01" },
  { id: "POS-004", serial: "VFN-240M-AA004", make: "Verifone",       model: "V240m",     status: "Idle",        appVersion: "ORO Ticket v2.2.5", stationId: "STN-003", employeeId: "",        lastAssigned: "2023-09-15" },
];

const PETTY_CASH = [
  { employeeId: "EMP-001", amount: 2000, date: "2024-11-01", method: "Bank Transfer" },
  { employeeId: "EMP-001", amount: 1500, date: "2024-12-10", method: "Telebirr"      },
  { employeeId: "EMP-004", amount: 3000, date: "2024-11-20", method: "Cheque"        },
  { employeeId: "EMP-004", amount: 1200, date: "2025-01-05", method: "Bank Transfer" },
];

const LATEST_APP_VERSION = "ORO Ticket v2.4.1";

// ─── Computed metrics ─────────────────────────────────────────────────────────

const totalStations   = STATIONS.length;
const totalEmployees  = EMPLOYEES.length;
const activeEmployees = EMPLOYEES.filter(e => e.isWorking).length;
const totalPOS        = POS_MACHINES.length;
const activePOS       = POS_MACHINES.filter(p => p.status === "Active").length;
const idlePOS         = POS_MACHINES.filter(p => p.status === "Idle").length;
const maintenancePOS  = POS_MACHINES.filter(p => p.status === "Maintenance").length;
const outdatedPOS     = POS_MACHINES.filter(p => p.appVersion !== LATEST_APP_VERSION);
const unassignedPOS   = POS_MACHINES.filter(p => !p.employeeId && p.status !== "Maintenance" && p.status !== "Decommissioned");
const totalSalary     = EMPLOYEES.reduce((s, e) => s + e.salary, 0);
const totalPettyCash  = PETTY_CASH.reduce((s, p) => s + p.amount, 0);
const supervisors     = EMPLOYEES.filter(e => e.role === "Supervisor");
const supervisorPettyCash = supervisors.map(sup => ({
  ...sup,
  total: PETTY_CASH.filter(p => p.employeeId === sup.id).reduce((s, p) => s + p.amount, 0),
}));

// Station health enrichment
const stationHealth = STATIONS.map(st => {
  const emps  = EMPLOYEES.filter(e => e.stationId === st.id);
  const poses = POS_MACHINES.filter(p => p.stationId === st.id);
  const activePoses  = poses.filter(p => p.status === "Active");
  const issues: string[] = [];
  if (emps.length === 0)           issues.push("No staff assigned");
  if (poses.filter(p => p.status === "Active").length === 0) issues.push("No active POS");
  if (poses.some(p => p.appVersion !== LATEST_APP_VERSION))  issues.push("POS needs update");
  if (emps.every(e => !e.isWorking)) issues.push("No staff currently working");
  const health = issues.length === 0 ? "good" : issues.length === 1 ? "warning" : "critical";
  return { ...st, emps, poses, activePoses, issues, health };
});

// Alerts
type Alert = { id: string; severity: "critical" | "warning" | "info"; message: string; detail: string; link: string };
const ALERTS: Alert[] = [
  ...outdatedPOS.map(p => ({
    id: `outdated-${p.id}`, severity: "warning" as const,
    message: `${p.serial} is running ${p.appVersion}`,
    detail: `Latest is ${LATEST_APP_VERSION} · Station: ${STATIONS.find(s => s.id === p.stationId)?.name ?? "—"}`,
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

// Fake sparkline data (replace with real daily data later)
const SPARKLINE = [42, 58, 51, 67, 73, 61, 80, 74, 88, 95, 84, 91];

// ─── Shared UI atoms ──────────────────────────────────────────────────────────

function StatCard({ icon, label, value, sub, color, lightColor, trend }: {
  icon: React.ReactNode; label: string; value: string | number;
  sub?: string; color: string; lightColor: string; trend?: "up" | "down" | "neutral";
}) {
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "18px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ width: 38, height: 38, borderRadius: 10, background: lightColor, display: "flex", alignItems: "center", justifyContent: "center", color, flexShrink: 0 }}>
          {icon}
        </div>
        {trend && (
          <span style={{ fontSize: 11, fontWeight: 700, color: trend === "up" ? "#16a34a" : trend === "down" ? "#dc2626" : "var(--muted-foreground)", background: trend === "up" ? "#dcfce7" : trend === "down" ? "#fee2e2" : "var(--background)", padding: "2px 7px", borderRadius: 999 }}>
            {trend === "up" ? "↑" : trend === "down" ? "↓" : "—"}
          </span>
        )}
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

// ─── Sparkline (pure SVG) ────────────────────────────────────────────────────

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const W = 120; const H = 36; const pad = 2;
  const max = Math.max(...data); const min = Math.min(...data);
  const pts = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (W - pad * 2);
    const y = pad + (1 - (v - min) / (max - min || 1)) * (H - pad * 2);
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg width={W} height={H} style={{ display: "block" }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── POS donut (pure SVG) ────────────────────────────────────────────────────

function POSDonut() {
  const slices = [
    { label: "Active",      count: activePOS,      color: "#16a34a" },
    { label: "Idle",        count: idlePOS,         color: "#d97706" },
    { label: "Maintenance", count: maintenancePOS,  color: "#dc2626" },
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

function RoleBar() {
  const roles = [
    { label: "Supervisor", count: EMPLOYEES.filter(e => e.role === "Supervisor").length, color: "#7c3aed" },
    { label: "Ticketer",   count: EMPLOYEES.filter(e => e.role === "Ticketer").length,   color: "#2563eb" },
    { label: "Cashier",    count: EMPLOYEES.filter(e => e.role === "Cashier").length,    color: "#d97706" },
  ];
  const total = EMPLOYEES.length;
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

// ─── Main dashboard ───────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [alertsExpanded, setAlertsExpanded] = useState(true);

  return (
    <>
      <style>{`
        * { box-sizing: border-box; }
        a { text-decoration: none; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
      `}</style>

      <div style={{ minHeight: "100vh", background: "var(--background)", padding: "28px 32px 48px" }}>

        {/* ── Header ── */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 }}>
          <div>
            <p style={{ fontSize: 12, fontWeight: 600, color: "var(--primary)", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 4px" }}>
              Adrash Admin
            </p>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: "var(--foreground)", margin: 0 }}>Operations Dashboard</h1>
            <p style={{ fontSize: 13, color: "var(--muted-foreground)", margin: "5px 0 0", display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#16a34a", display: "inline-block", animation: "pulse 2s infinite" }} />
              {fmtDate(TODAY)}
            </p>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <a href="/dashboard/reports" style={{ height: 38, padding: "0 16px", borderRadius: 9, border: "1.5px solid var(--border)", background: "var(--surface)", fontSize: 13, fontWeight: 600, color: "var(--foreground)", display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
              <BarChart3 size={15} /> Reports
            </a>
          </div>
        </div>

        {/* ── ALERTS ── */}
        {ALERTS.length > 0 && (
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
        )}

        {/* ── KPI STRIP ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 28 }}>
          <StatCard icon={<MapPin size={18} />}  label="Stations"       value={totalStations}   sub="All regions"                             color="#2563eb" lightColor="#dbeafe" />
          <StatCard icon={<Users size={18} />}    label="Employees"      value={totalEmployees}  sub={`${activeEmployees} currently working`}  color="#7c3aed" lightColor="#ede9fe" trend="neutral" />
          <StatCard icon={<Monitor size={18} />}  label="POS Machines"   value={totalPOS}        sub={`${activePOS} active · ${idlePOS} idle`} color="#16a34a" lightColor="#dcfce7" />
          <StatCard icon={<Banknote size={18} />} label="Monthly Salary" value={`${fmtCurrency(totalSalary)} ETB`} sub={`${EMPLOYEES.length} employees`} color="#d97706" lightColor="#fef3c7" />
        </div>

        {/* ── ROW 2: Financial + Staff + Fleet ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 28 }}>

          {/* Financial summary */}
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "20px 22px" }}>
            <SectionHeader title="Financials" sub="Salary & petty cash" action={<NavLink href="/dashboard/reports" label="Full report" />} />
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {[
                { label: "Total salary bill",     value: `${fmtCurrency(totalSalary)} ETB`,     color: "#d97706", icon: <Banknote size={13} /> },
                { label: "Total petty cash out",  value: `${fmtCurrency(totalPettyCash)} ETB`,  color: "#dc2626", icon: <Wallet size={13} />   },
                { label: "Avg salary / employee", value: `${fmtCurrency(totalSalary / EMPLOYEES.length)} ETB`, color: "#7c3aed", icon: <TrendingUp size={13} /> },
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

            {/* Daily revenue placeholder */}
            <div style={{ marginTop: 14, padding: "12px 14px", background: "var(--background)", borderRadius: 9, border: "1px dashed var(--border)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: "var(--muted-foreground)", fontWeight: 600 }}>Daily revenue</span>
                <span style={{ fontSize: 10, color: "var(--primary)", fontWeight: 700, background: "#dbeafe", padding: "1px 7px", borderRadius: 999 }}>Coming soon</span>
              </div>
              <Sparkline data={SPARKLINE} color="#2563eb" />
              <p style={{ fontSize: 10, color: "var(--muted-foreground)", margin: "6px 0 0", fontStyle: "italic" }}>Revenue data will appear once ticket sales are connected.</p>
            </div>
          </div>

          {/* Staff breakdown */}
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "20px 22px" }}>
            <SectionHeader title="Staff" sub={`${activeEmployees} of ${totalEmployees} working today`} action={<NavLink href="/dashboard/employees" label="View all" />} />

            {/* Active / inactive chips */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
              <div style={{ padding: "10px 12px", borderRadius: 9, background: "#dcfce7", border: "1px solid #bbf7d0", display: "flex", alignItems: "center", gap: 7 }}>
                <UserCheck size={14} color="#16a34a" />
                <div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: "#16a34a", fontFamily: "monospace" }}>{activeEmployees}</div>
                  <div style={{ fontSize: 10, color: "#16a34a", fontWeight: 600 }}>Working</div>
                </div>
              </div>
              <div style={{ padding: "10px 12px", borderRadius: 9, background: "#fef2f2", border: "1px solid #fecaca", display: "flex", alignItems: "center", gap: 7 }}>
                <UserX size={14} color="#dc2626" />
                <div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: "#dc2626", fontFamily: "monospace" }}>{totalEmployees - activeEmployees}</div>
                  <div style={{ fontSize: 10, color: "#dc2626", fontWeight: 600 }}>Inactive</div>
                </div>
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>By role</p>
              <RoleBar />
            </div>

            {/* Petty cash by supervisor */}
            <p style={{ fontSize: 11, fontWeight: 700, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Petty cash — supervisors</p>
            {supervisorPettyCash.map(sup => (
              <div key={sup.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#ede9fe", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: "#7c3aed" }}>{sup.name.charAt(0)}</span>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--foreground)" }}>{sup.name}</div>
                    <div style={{ fontSize: 11, color: "var(--muted-foreground)" }}>{STATIONS.find(s => s.id === sup.stationId)?.name ?? "—"}</div>
                  </div>
                </div>
                <span style={{ fontSize: 13, fontWeight: 800, color: "#7c3aed", fontFamily: "monospace" }}>{fmtCurrency(sup.total)} ETB</span>
              </div>
            ))}
          </div>

          {/* POS fleet */}
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "20px 22px" }}>
            <SectionHeader title="POS Fleet" sub={`${totalPOS} machines across ${totalStations} stations`} action={<NavLink href="/dashboard/pos-machines" label="Manage" />} />
            <POSDonut />

            <div style={{ marginTop: 18 }}>
              {/* App version summary */}
              <p style={{ fontSize: 11, fontWeight: 700, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>App versions</p>
              {[...new Set(POS_MACHINES.map(p => p.appVersion))].map(v => {
                const count  = POS_MACHINES.filter(p => p.appVersion === v).length;
                const latest = v === LATEST_APP_VERSION;
                return (
                  <div key={v} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: "1px solid var(--border)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <span style={{ width: 7, height: 7, borderRadius: "50%", background: latest ? "#16a34a" : "#d97706", display: "inline-block", flexShrink: 0 }} />
                      <span style={{ fontSize: 12, color: "var(--foreground)", fontFamily: "monospace" }}>{v}</span>
                      {latest && <span style={{ fontSize: 10, fontWeight: 700, color: "#16a34a", background: "#dcfce7", padding: "1px 6px", borderRadius: 999 }}>latest</span>}
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 700, fontFamily: "monospace", color: latest ? "#16a34a" : "#d97706" }}>{count} machine{count > 1 ? "s" : ""}</span>
                  </div>
                );
              })}
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
                      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>{st.id}</div>
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
                      { icon: <Users size={12} />,   label: "Staff",       value: st.emps.length,       color: "#7c3aed" },
                      { icon: <Monitor size={12} />, label: "POS",         value: st.poses.length,      color: "#2563eb" },
                      { icon: <Zap size={12} />,     label: "Active POS",  value: st.activePoses.length, color: "#16a34a" },
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
                  {st.emps.length > 0 && (
                    <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
                      {st.emps.slice(0, 3).map(emp => (
                        <div key={emp.id} style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5 }}>
                          <div style={{ width: 22, height: 22, borderRadius: "50%", background: "#ede9fe", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            <span style={{ fontSize: 9, fontWeight: 800, color: "#7c3aed" }}>{emp.name.charAt(0)}</span>
                          </div>
                          <span style={{ fontSize: 11, color: "var(--foreground)", fontWeight: 500, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{emp.name}</span>
                          <span style={{ fontSize: 10, color: emp.role === "Supervisor" ? "#7c3aed" : emp.role === "Cashier" ? "#d97706" : "#2563eb", background: emp.role === "Supervisor" ? "#ede9fe" : emp.role === "Cashier" ? "#fef3c7" : "#dbeafe", padding: "1px 6px", borderRadius: 999, fontWeight: 600, whiteSpace: "nowrap" }}>{emp.role}</span>
                          <span style={{ width: 7, height: 7, borderRadius: "50%", background: emp.isWorking ? "#16a34a" : "#e2e8f0", flexShrink: 0 }} title={emp.isWorking ? "Working" : "Inactive"} />
                        </div>
                      ))}
                      {st.emps.length > 3 && (
                        <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>+{st.emps.length - 3} more</span>
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
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Supervisor", "Amount", "Method", "Date"].map(h => (
                    <th key={h} style={{ padding: "6px 8px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid var(--border)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...PETTY_CASH].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5).map((p, i) => {
                  const emp = EMPLOYEES.find(e => e.id === p.employeeId);
                  return (
                    <tr key={i}>
                      <td style={{ padding: "9px 8px", fontSize: 12, color: "var(--foreground)", fontWeight: 500, borderBottom: "1px solid var(--border)" }}>{emp?.name ?? "—"}</td>
                      <td style={{ padding: "9px 8px", fontSize: 12, fontWeight: 800, color: "#7c3aed", fontFamily: "monospace", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" }}>{fmtCurrency(p.amount)} ETB</td>
                      <td style={{ padding: "9px 8px", fontSize: 11, color: "var(--muted-foreground)", borderBottom: "1px solid var(--border)" }}>{p.method}</td>
                      <td style={{ padding: "9px 8px", fontSize: 11, color: "var(--muted-foreground)", fontFamily: "monospace", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" }}>{p.date}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* POS machine quick table */}
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "20px 22px" }}>
            <SectionHeader title="POS machines" sub="Status at a glance" action={<NavLink href="/dashboard/pos-machines" label="Full fleet" />} />
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Serial", "Status", "Station", "Version"].map(h => (
                    <th key={h} style={{ padding: "6px 8px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid var(--border)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {POS_MACHINES.map((p, i) => {
                  const statusColor = p.status === "Active" ? "#16a34a" : p.status === "Idle" ? "#d97706" : p.status === "Maintenance" ? "#dc2626" : "#64748b";
                  const statusBg    = p.status === "Active" ? "#dcfce7" : p.status === "Idle" ? "#fef3c7" : p.status === "Maintenance" ? "#fee2e2" : "#f1f5f9";
                  const outdated    = p.appVersion !== LATEST_APP_VERSION;
                  return (
                    <tr key={i}>
                      <td style={{ padding: "9px 8px", fontSize: 11, fontFamily: "monospace", fontWeight: 600, color: "var(--foreground)", borderBottom: "1px solid var(--border)" }}>{p.serial}</td>
                      <td style={{ padding: "9px 8px", borderBottom: "1px solid var(--border)" }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: statusColor, background: statusBg, padding: "2px 7px", borderRadius: 999 }}>{p.status}</span>
                      </td>
                      <td style={{ padding: "9px 8px", fontSize: 11, color: "var(--muted-foreground)", borderBottom: "1px solid var(--border)", maxWidth: 110, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {STATIONS.find(s => s.id === p.stationId)?.name ?? "—"}
                      </td>
                      <td style={{ padding: "9px 8px", fontSize: 10, borderBottom: "1px solid var(--border)" }}>
                        <span style={{ fontWeight: 700, color: outdated ? "#d97706" : "#16a34a", background: outdated ? "#fef3c7" : "#dcfce7", padding: "2px 6px", borderRadius: 999 }}>
                          {outdated ? "Outdated" : "Latest"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </>
  );
}