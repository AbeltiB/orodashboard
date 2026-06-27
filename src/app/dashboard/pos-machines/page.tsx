"use client";

import { useState } from "react";
import {
  Monitor, Plus, Pencil, Trash2, X, Check, Search,
  AlertCircle, MapPin, User, ChevronRight, Clock,
  History, Info, ArrowRightLeft,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type POSStatus = "Active" | "Idle" | "Maintenance" | "Decommissioned";

type AssignmentEntry = {
  id: string;
  employeeId: string;
  employeeName: string;
  stationId: string;
  stationName: string;
  from: string;       // ISO date
  to: string | null;  // null = current
  remark: string;
};

type POSMachine = {
  id: string;
  make: string;
  model: string;
  serial: string;
  status: POSStatus;
  appVersion: string;
  currentEmployeeId: string;
  currentEmployeeName: string;
  currentStationId: string;
  currentStationName: string;
  remark: string;
  assignmentHistory: AssignmentEntry[];
};

// ─── Seed data ────────────────────────────────────────────────────────────────

const STATIONS = [
  { id: "STN-001", name: "Meskel Square Terminal" },
  { id: "STN-002", name: "Bole Station" },
  { id: "STN-003", name: "Piassa Hub" },
];

const EMPLOYEES = [
  { id: "EMP-001", name: "Abebe Girma",   stationId: "STN-001" },
  { id: "EMP-002", name: "Tigist Haile",  stationId: "STN-001" },
  { id: "EMP-003", name: "Dawit Tesfaye", stationId: "STN-002" },
  { id: "EMP-004", name: "Sara Kebede",   stationId: "STN-003" },
];

const MAKES = ["Verifone", "PAX Technology", "Ingenico", "Newland", "BBPOS", "Other"];
const APP_VERSIONS = ["ORO Ticket v2.4.1", "ORO Ticket v2.3.8", "ORO Ticket v2.2.5", "ORO Ticket v2.1.0"];

const SEED: POSMachine[] = [
  {
    id: "POS-001",
    make: "Verifone", model: "V240m", serial: "VFN-240M-AA001",
    status: "Active", appVersion: "ORO Ticket v2.4.1",
    currentEmployeeId: "EMP-001", currentEmployeeName: "Abebe Girma",
    currentStationId: "STN-001",  currentStationName: "Meskel Square Terminal",
    remark: "Primary station POS. Handle with care.",
    assignmentHistory: [
      { id: "h1", employeeId: "EMP-003", employeeName: "Dawit Tesfaye",  stationId: "STN-002", stationName: "Bole Station",            from: "2023-01-10", to: "2023-08-15", remark: "Initial deployment" },
      { id: "h2", employeeId: "EMP-002", employeeName: "Tigist Haile",   stationId: "STN-001", stationName: "Meskel Square Terminal",  from: "2023-08-16", to: "2024-02-28", remark: "Transferred after Bole expansion" },
      { id: "h3", employeeId: "EMP-001", employeeName: "Abebe Girma",    stationId: "STN-001", stationName: "Meskel Square Terminal",  from: "2024-03-01", to: null,         remark: "" },
    ],
  },
  {
    id: "POS-002",
    make: "PAX Technology", model: "A920", serial: "PAX-A920-AA002",
    status: "Active", appVersion: "ORO Ticket v2.4.1",
    currentEmployeeId: "EMP-002", currentEmployeeName: "Tigist Haile",
    currentStationId: "STN-001",  currentStationName: "Meskel Square Terminal",
    remark: "",
    assignmentHistory: [
      { id: "h4", employeeId: "EMP-002", employeeName: "Tigist Haile", stationId: "STN-001", stationName: "Meskel Square Terminal", from: "2023-06-01", to: null, remark: "New unit" },
    ],
  },
  {
    id: "POS-003",
    make: "Ingenico", model: "Move 5000", serial: "ING-MV5K-AA003",
    status: "Maintenance", appVersion: "ORO Ticket v2.3.8",
    currentEmployeeId: "", currentEmployeeName: "",
    currentStationId: "STN-002", currentStationName: "Bole Station",
    remark: "Screen cracked. Sent for repair 2025-01-10. ETA 2 weeks.",
    assignmentHistory: [
      { id: "h5", employeeId: "EMP-003", employeeName: "Dawit Tesfaye", stationId: "STN-002", stationName: "Bole Station", from: "2022-11-01", to: "2025-01-09", remark: "Dropped — screen damage" },
    ],
  },
  {
    id: "POS-004",
    make: "Verifone", model: "V240m", serial: "VFN-240M-AA004",
    status: "Idle", appVersion: "ORO Ticket v2.2.5",
    currentEmployeeId: "", currentEmployeeName: "",
    currentStationId: "STN-003", currentStationName: "Piassa Hub",
    remark: "Spare unit. Needs app update before deployment.",
    assignmentHistory: [],
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uid() { return Math.random().toString(36).slice(2, 9); }

function statusStyle(s: POSStatus): { bg: string; fg: string } {
  return s === "Active"          ? { bg: "#dcfce7", fg: "#16a34a" }
       : s === "Idle"            ? { bg: "#fef3c7", fg: "#d97706" }
       : s === "Maintenance"     ? { bg: "#fee2e2", fg: "#dc2626" }
       :                           { bg: "#f1f5f9", fg: "#64748b" };
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function duration(from: string, to: string | null) {
  const start = new Date(from).getTime();
  const end   = to ? new Date(to).getTime() : Date.now();
  const days  = Math.floor((end - start) / 86400000);
  if (days < 30)  return `${days}d`;
  if (days < 365) return `${Math.floor(days / 30)}mo`;
  return `${(days / 365).toFixed(1)}yr`;
}

// ─── Shared UI ────────────────────────────────────────────────────────────────

const iCss: React.CSSProperties = {
  width: "100%", height: 42, padding: "0 12px",
  border: "1.5px solid var(--border)", borderRadius: 10,
  background: "var(--surface)", color: "var(--foreground)",
  fontSize: 14, outline: "none",
};
const selCss: React.CSSProperties = { ...iCss, cursor: "pointer" };
const taCss:  React.CSSProperties = { ...iCss, height: 76, padding: "10px 12px", resize: "vertical" as const, fontFamily: "inherit" };

function Field({ label, span2, children }: { label: string; span2?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14, gridColumn: span2 ? "span 2" : "span 1" }}>
      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--muted-foreground)", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</label>
      {children}
    </div>
  );
}

function Badge({ label, bg, fg }: { label: string; bg: string; fg: string }) {
  return <span style={{ display: "inline-flex", alignItems: "center", padding: "2px 10px", borderRadius: 999, fontSize: 11, fontWeight: 600, background: bg, color: fg }}>{label}</span>;
}

function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useState(() => { const t = setTimeout(onDone, 2400); return () => clearTimeout(t); });
  return (
    <div style={{ position: "fixed", bottom: 28, right: 28, zIndex: 9999, background: "#0f172a", color: "#fff", padding: "12px 20px", borderRadius: 12, fontSize: 14, fontWeight: 500, display: "flex", alignItems: "center", gap: 8, boxShadow: "0 8px 30px rgb(0 0 0 / 0.18)", animation: "fadeUp 0.22s ease" }}>
      <Check size={15} strokeWidth={2.5} color="#4ade80" />{message}
    </div>
  );
}

function Modal({ title, wide, onClose, children }: { title: string; wide?: boolean; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgb(0 0 0 / 0.35)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: "var(--surface)", borderRadius: 18, width: "100%", maxWidth: wide ? 660 : 520, boxShadow: "0 24px 60px rgb(0 0 0 / 0.18)", border: "1px solid var(--border)", maxHeight: "92vh", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 24px 0", flexShrink: 0 }}>
          <span style={{ fontSize: 17, fontWeight: 700, color: "var(--foreground)" }}>{title}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", padding: 4 }}><X size={18} /></button>
        </div>
        <div style={{ padding: "20px 24px 24px", overflowY: "auto", flex: 1 }}>{children}</div>
      </div>
    </div>
  );
}

// ─── POS Form Modal ───────────────────────────────────────────────────────────

function POSFormModal({ initial, onSave, onClose }: { initial?: POSMachine; onSave: (p: POSMachine) => void; onClose: () => void }) {
  const blank: POSMachine = {
    id: "", make: "", model: "", serial: "", status: "Active",
    appVersion: APP_VERSIONS[0],
    currentEmployeeId: "", currentEmployeeName: "",
    currentStationId: "", currentStationName: "",
    remark: "", assignmentHistory: [],
  };
  const [form, setForm] = useState<POSMachine>(initial ?? blank);
  const [addingAssignment, setAddingAssignment] = useState(false);

  const set = <K extends keyof POSMachine>(k: K, v: POSMachine[K]) => setForm(f => ({ ...f, [k]: v }));

  const filteredEmployees = EMPLOYEES.filter(e => !form.currentStationId || e.stationId === form.currentStationId);
  const valid = form.make.trim() && form.model.trim() && form.serial.trim();

  function save() {
    if (!valid) return;
    const station  = STATIONS.find(s => s.id === form.currentStationId);
    const employee = EMPLOYEES.find(e => e.id === form.currentEmployeeId);
    // If current assignment changed, close previous open entry and add new
    let history = form.assignmentHistory;
    if (form.currentStationId || form.currentEmployeeId) {
      const lastOpen = history.find(h => h.to === null);
      const sameAssignment = lastOpen?.employeeId === form.currentEmployeeId && lastOpen?.stationId === form.currentStationId;
      if (!sameAssignment) {
        history = history.map(h => h.to === null ? { ...h, to: new Date().toISOString().slice(0, 10) } : h);
        if (form.currentStationId || form.currentEmployeeId) {
          history = [...history, {
            id: uid(),
            employeeId: form.currentEmployeeId,
            employeeName: employee?.name ?? form.currentEmployeeName,
            stationId: form.currentStationId,
            stationName: station?.name ?? form.currentStationName,
            from: new Date().toISOString().slice(0, 10),
            to: null,
            remark: "",
          }];
        }
      }
    }
    onSave({
      ...form,
      id: form.id || `POS-${String(Date.now()).slice(-4)}`,
      currentStationName: station?.name ?? "",
      currentEmployeeName: employee?.name ?? "",
      assignmentHistory: history,
    });
  }

  return (
    <Modal title={initial ? "Edit POS machine" : "Register POS machine"} wide onClose={onClose}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
        <Field label="Make *">
          <select style={selCss} value={form.make} onChange={e => set("make", e.target.value)}>
            <option value="">Select make…</option>
            {MAKES.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </Field>
        <Field label="Model *">
          <input style={iCss} value={form.model} onChange={e => set("model", e.target.value)} placeholder="e.g. V240m, A920" autoFocus />
        </Field>
        <Field label="Serial number *" span2>
          <input style={{ ...iCss, fontFamily: "monospace", letterSpacing: "0.06em" }} value={form.serial} onChange={e => set("serial", e.target.value.toUpperCase())} placeholder="XXX-XXXX-XXXXX" />
        </Field>
        <Field label="Status">
          <select style={selCss} value={form.status} onChange={e => set("status", e.target.value as POSStatus)}>
            <option value="Active">Active</option>
            <option value="Idle">Idle</option>
            <option value="Maintenance">Maintenance</option>
            <option value="Decommissioned">Decommissioned</option>
          </select>
        </Field>
        <Field label="ORO Ticket app version">
          <select style={selCss} value={form.appVersion} onChange={e => set("appVersion", e.target.value)}>
            {APP_VERSIONS.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </Field>

        {/* Divider */}
        <div style={{ gridColumn: "span 2", borderTop: "1px solid var(--border)", margin: "6px 0 14px" }}>
          <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--muted-foreground)", margin: "10px 0 0" }}>Current assignment</p>
        </div>

        <Field label="Station">
          <select style={selCss} value={form.currentStationId} onChange={e => { set("currentStationId", e.target.value); set("currentEmployeeId", ""); set("currentEmployeeName", ""); }}>
            <option value="">Unassigned</option>
            {STATIONS.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <Field label="Assigned to (employee)">
          <select style={selCss} value={form.currentEmployeeId} onChange={e => set("currentEmployeeId", e.target.value)} disabled={!form.currentStationId}>
            <option value="">Unassigned</option>
            {filteredEmployees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </Field>

        <Field label="Remark / notes" span2>
          <textarea style={taCss} value={form.remark} onChange={e => set("remark", e.target.value)} placeholder="Any comments about condition, deployment notes, etc." />
        </Field>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 4 }}>
        <button onClick={onClose} style={{ height: 40, padding: "0 18px", borderRadius: 10, border: "1.5px solid var(--border)", background: "var(--surface)", fontSize: 14, cursor: "pointer", color: "var(--foreground)" }}>Cancel</button>
        <button onClick={save} disabled={!valid} style={{ height: 40, padding: "0 22px", borderRadius: 10, border: "none", background: "var(--primary)", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", opacity: valid ? 1 : 0.5 }}>
          {initial ? "Save changes" : "Register machine"}
        </button>
      </div>
    </Modal>
  );
}

// ─── Reassign Modal ───────────────────────────────────────────────────────────

function ReassignModal({ pos, onSave, onClose }: { pos: POSMachine; onSave: (p: POSMachine) => void; onClose: () => void }) {
  const [stationId,   setStationId]   = useState(pos.currentStationId);
  const [employeeId,  setEmployeeId]  = useState(pos.currentEmployeeId);
  const [remark,      setRemark]      = useState("");
  const filteredEmployees = EMPLOYEES.filter(e => !stationId || e.stationId === stationId);

  function save() {
    const station  = STATIONS.find(s => s.id === stationId);
    const employee = EMPLOYEES.find(e => e.id === employeeId);
    const today = new Date().toISOString().slice(0, 10);
    const history = [
      ...pos.assignmentHistory.map(h => h.to === null ? { ...h, to: today } : h),
      {
        id: uid(),
        employeeId:    employee?.id    ?? "",
        employeeName:  employee?.name  ?? "",
        stationId:     station?.id     ?? "",
        stationName:   station?.name   ?? "",
        from: today,
        to: null,
        remark,
      },
    ];
    onSave({ ...pos, currentStationId: stationId, currentStationName: station?.name ?? "", currentEmployeeId: employeeId, currentEmployeeName: employee?.name ?? "", assignmentHistory: history });
  }

  return (
    <Modal title="Reassign POS machine" onClose={onClose}>
      <p style={{ fontSize: 13, color: "var(--muted-foreground)", marginBottom: 18 }}>
        Reassigning <strong style={{ color: "var(--foreground)" }}>{pos.serial}</strong>. The current assignment will be closed and a new history entry created.
      </p>
      <Field label="New station">
        <select style={selCss} value={stationId} onChange={e => { setStationId(e.target.value); setEmployeeId(""); }}>
          <option value="">Unassigned</option>
          {STATIONS.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </Field>
      <Field label="Assign to employee">
        <select style={selCss} value={employeeId} onChange={e => setEmployeeId(e.target.value)} disabled={!stationId}>
          <option value="">Unassigned</option>
          {filteredEmployees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      </Field>
      <Field label="Reason / remark">
        <textarea style={taCss} value={remark} onChange={e => setRemark(e.target.value)} placeholder="Transfer reason, condition notes…" />
      </Field>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 4 }}>
        <button onClick={onClose} style={{ height: 40, padding: "0 18px", borderRadius: 10, border: "1.5px solid var(--border)", background: "var(--surface)", fontSize: 14, cursor: "pointer", color: "var(--foreground)" }}>Cancel</button>
        <button onClick={save} style={{ height: 40, padding: "0 22px", borderRadius: 10, border: "none", background: "var(--primary)", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Confirm reassignment</button>
      </div>
    </Modal>
  );
}

// ─── Delete modal ─────────────────────────────────────────────────────────────

function DeleteModal({ serial, onConfirm, onClose }: { serial: string; onConfirm: () => void; onClose: () => void }) {
  return (
    <Modal title="Decommission POS machine" onClose={onClose}>
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start", marginBottom: 24 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: "#fee2e2", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <AlertCircle size={20} color="#dc2626" />
        </div>
        <p style={{ fontSize: 14, color: "var(--muted-foreground)", lineHeight: 1.6, margin: 0 }}>
          Permanently remove <strong style={{ color: "var(--foreground)", fontFamily: "monospace" }}>{serial}</strong> from the system? Its full assignment history will also be deleted. This cannot be undone.
        </p>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <button onClick={onClose} style={{ height: 40, padding: "0 18px", borderRadius: 10, border: "1.5px solid var(--border)", background: "var(--surface)", fontSize: 14, cursor: "pointer", color: "var(--foreground)" }}>Cancel</button>
        <button onClick={onConfirm} style={{ height: 40, padding: "0 22px", borderRadius: 10, border: "none", background: "#dc2626", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Remove machine</button>
      </div>
    </Modal>
  );
}

// ─── Detail Panel ─────────────────────────────────────────────────────────────

type Tab = "current" | "history";

function DetailPanel({ pos, onEdit, onDelete, onReassign, onUpdate }: {
  pos: POSMachine;
  onEdit: () => void;
  onDelete: () => void;
  onReassign: () => void;
  onUpdate: (p: POSMachine) => void;
}) {
  const [tab, setTab] = useState<Tab>("current");
  const ss = statusStyle(pos.status);

  // inline remark edit
  const [editingRemark, setEditingRemark] = useState(false);
  const [remarkDraft,   setRemarkDraft]   = useState(pos.remark);

  function saveRemark() {
    onUpdate({ ...pos, remark: remarkDraft });
    setEditingRemark(false);
  }

  function TabBtn({ id, label, count }: { id: Tab; label: string; count?: number }) {
    const active = tab === id;
    return (
      <button onClick={() => setTab(id)} style={{ height: 34, padding: "0 14px", borderRadius: 8, border: "none", background: active ? "color-mix(in srgb, var(--primary) 10%, transparent)" : "none", color: active ? "var(--primary)" : "var(--muted-foreground)", fontSize: 13, fontWeight: active ? 600 : 400, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
        {label}
        {count !== undefined && <span style={{ background: active ? "var(--primary)" : "var(--border)", color: active ? "#fff" : "var(--muted-foreground)", borderRadius: 999, padding: "1px 7px", fontSize: 11, fontWeight: 600 }}>{count}</span>}
      </button>
    );
  }

  function InfoRow({ label, value, mono, accent }: { label: string; value: string; mono?: boolean; accent?: boolean }) {
    return (
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
        <span style={{ fontSize: 12, color: "var(--muted-foreground)", fontWeight: 500 }}>{label}</span>
        <span style={{ fontSize: 14, color: accent ? "var(--primary)" : "var(--foreground)", fontWeight: 500, fontFamily: mono ? "monospace" : "inherit", letterSpacing: mono ? "0.05em" : 0 }}>{value}</span>
      </div>
    );
  }

  const latestVersion = APP_VERSIONS[0];
  const isOutdated = pos.appVersion !== latestVersion;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header */}
      <div style={{ padding: "28px 28px 0", flexShrink: 0 }}>
        <div style={{ display: "flex", gap: 16, alignItems: "flex-start", marginBottom: 16 }}>
          {/* Icon */}
          <div style={{ width: 52, height: 52, borderRadius: 14, background: ss.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Monitor size={24} color={ss.fg} />
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", color: "var(--muted-foreground)", textTransform: "uppercase", marginBottom: 3 }}>{pos.id}</div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--foreground)", margin: 0, fontFamily: "monospace" }}>{pos.serial}</h2>
            <div style={{ fontSize: 14, color: "var(--muted-foreground)", marginTop: 2 }}>{pos.make} {pos.model}</div>
            <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
              <Badge label={pos.status} bg={ss.bg} fg={ss.fg} />
              <Badge
                label={pos.appVersion}
                bg={isOutdated ? "#fef3c7" : "#dbeafe"}
                fg={isOutdated ? "#d97706" : "#1d4ed8"}
              />
              {isOutdated && <Badge label="Update available" bg="#fee2e2" fg="#dc2626" />}
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: 8, flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <button onClick={onReassign} style={{ height: 34, padding: "0 14px", borderRadius: 8, border: "1.5px solid var(--border)", background: "var(--surface)", fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 5, color: "var(--foreground)", fontWeight: 500 }}>
              <ArrowRightLeft size={13} /> Reassign
            </button>
            <button onClick={onEdit} style={{ height: 34, padding: "0 14px", borderRadius: 8, border: "1.5px solid var(--border)", background: "var(--surface)", fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 5, color: "var(--foreground)", fontWeight: 500 }}>
              <Pencil size={13} /> Edit
            </button>
            <button onClick={onDelete} style={{ height: 34, padding: "0 14px", borderRadius: 8, border: "1.5px solid #fecaca", background: "#fff5f5", fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 5, color: "#dc2626", fontWeight: 500 }}>
              <Trash2 size={13} /> Remove
            </button>
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 20 }}>
          {[
            { label: "Station",       value: pos.currentStationName  || "Unassigned",        icon: <MapPin size={13} /> },
            { label: "Operator",      value: pos.currentEmployeeName || "Unassigned",         icon: <User size={13} /> },
            { label: "Assignments",   value: `${pos.assignmentHistory.length} total`,          icon: <History size={13} /> },
          ].map(s => (
            <div key={s.label} style={{ background: "var(--background)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4, color: "var(--muted-foreground)", fontSize: 11, marginBottom: 4 }}>{s.icon}{s.label}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--foreground)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Tab bar */}
        <div style={{ display: "flex", gap: 2, borderBottom: "1px solid var(--border)" }}>
          <TabBtn id="current" label="Current" />
          <TabBtn id="history" label="Assignment history" count={pos.assignmentHistory.length} />
        </div>
      </div>

      {/* Tab body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "22px 28px 28px" }}>

        {/* ── Current ── */}
        {tab === "current" && (
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--muted-foreground)", marginBottom: 8 }}>Machine details</p>
            <InfoRow label="Make"          value={pos.make} />
            <InfoRow label="Model"         value={pos.model} />
            <InfoRow label="Serial number" value={pos.serial} mono />
            <InfoRow label="Status"        value={pos.status} />
            <InfoRow label="App version"   value={pos.appVersion} accent={!isOutdated} />

            <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--muted-foreground)", marginBottom: 8, marginTop: 22 }}>Current assignment</p>
            {pos.currentStationId || pos.currentEmployeeId ? (
              <>
                {pos.currentStationId && (
                  <div style={{ display: "flex", gap: 12, alignItems: "center", padding: "12px 14px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--background)", marginBottom: 8 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 9, background: "#dbeafe", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <MapPin size={16} color="#1d4ed8" />
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "var(--foreground)" }}>{pos.currentStationName}</div>
                      <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>{pos.currentStationId}</div>
                    </div>
                  </div>
                )}
                {pos.currentEmployeeId && (
                  <div style={{ display: "flex", gap: 12, alignItems: "center", padding: "12px 14px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--background)", marginBottom: 8 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 9, background: "#dcfce7", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <User size={16} color="#16a34a" />
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "var(--foreground)" }}>{pos.currentEmployeeName}</div>
                      <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>{pos.currentEmployeeId}</div>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div style={{ padding: "14px 16px", borderRadius: 10, border: "1px dashed var(--border)", background: "var(--background)", fontSize: 13, color: "var(--muted-foreground)", textAlign: "center" }}>
                Not currently assigned. Use <strong>Reassign</strong> to deploy this machine.
              </div>
            )}

            <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--muted-foreground)", marginBottom: 8, marginTop: 22 }}>Remarks</p>
            {editingRemark ? (
              <div>
                <textarea style={{ ...taCss, height: 90 }} value={remarkDraft} onChange={e => setRemarkDraft(e.target.value)} autoFocus />
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button onClick={saveRemark} style={{ height: 34, padding: "0 16px", borderRadius: 8, border: "none", background: "var(--primary)", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Save</button>
                  <button onClick={() => { setEditingRemark(false); setRemarkDraft(pos.remark); }} style={{ height: 34, padding: "0 14px", borderRadius: 8, border: "1.5px solid var(--border)", background: "var(--surface)", fontSize: 13, cursor: "pointer", color: "var(--foreground)" }}>Cancel</button>
                </div>
              </div>
            ) : (
              <div onClick={() => setEditingRemark(true)} style={{ padding: "12px 14px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--background)", fontSize: 14, color: pos.remark ? "var(--foreground)" : "var(--muted-foreground)", cursor: "pointer", lineHeight: 1.6, minHeight: 52 }}>
                {pos.remark || <span style={{ fontStyle: "italic" }}>Click to add a remark…</span>}
              </div>
            )}
          </div>
        )}

        {/* ── History ── */}
        {tab === "history" && (
          <div>
            {pos.assignmentHistory.length === 0 ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "40px 0", color: "var(--muted-foreground)" }}>
                <History size={32} style={{ marginBottom: 10, opacity: 0.25 }} />
                <p style={{ fontSize: 13 }}>No assignment history yet.</p>
              </div>
            ) : (
              <div style={{ position: "relative" }}>
                {/* Vertical timeline line */}
                <div style={{ position: "absolute", left: 18, top: 8, bottom: 8, width: 2, background: "var(--border)", borderRadius: 2 }} />

                {[...pos.assignmentHistory].reverse().map((entry, i) => {
                  const isCurrent = entry.to === null;
                  return (
                    <div key={entry.id} style={{ display: "flex", gap: 16, marginBottom: 20, position: "relative" }}>
                      {/* Timeline dot */}
                      <div style={{ width: 38, height: 38, borderRadius: "50%", background: isCurrent ? "var(--primary)" : "var(--border)", border: `3px solid var(--surface)`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, zIndex: 1 }}>
                        {isCurrent
                          ? <Monitor size={15} color="#fff" />
                          : <Clock size={14} color="var(--muted-foreground)" />
                        }
                      </div>

                      {/* Entry card */}
                      <div style={{ flex: 1, background: isCurrent ? "color-mix(in srgb, var(--primary) 6%, transparent)" : "var(--background)", border: `1px solid ${isCurrent ? "color-mix(in srgb, var(--primary) 25%, transparent)" : "var(--border)"}`, borderRadius: 12, padding: "12px 16px", marginTop: 2 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                          <div>
                            <span style={{ fontSize: 14, fontWeight: 700, color: "var(--foreground)" }}>
                              {entry.employeeName || "Unassigned"}
                            </span>
                            {isCurrent && <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, color: "var(--primary)", background: "color-mix(in srgb, var(--primary) 12%, transparent)", padding: "1px 8px", borderRadius: 999 }}>Current</span>}
                          </div>
                          <span style={{ fontSize: 11, color: "var(--muted-foreground)", fontFamily: "monospace", whiteSpace: "nowrap" }}>
                            {duration(entry.from, entry.to)}
                          </span>
                        </div>

                        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--muted-foreground)" }}>
                            <MapPin size={11} /> {entry.stationName || "No station"}
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--muted-foreground)" }}>
                            <Clock size={11} />
                            {fmtDate(entry.from)} → {entry.to ? fmtDate(entry.to) : <strong style={{ color: "var(--primary)" }}>Present</strong>}
                          </div>
                        </div>

                        {entry.remark && (
                          <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--border)", fontSize: 12, color: "var(--muted-foreground)", fontStyle: "italic" }}>
                            {entry.remark}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const STATUS_OPTIONS: (POSStatus | "All")[] = ["All", "Active", "Idle", "Maintenance", "Decommissioned"];

export default function POSMachinesPage() {
  const [machines,  setMachines]  = useState<POSMachine[]>(SEED);
  const [selected,  setSelected]  = useState<string | null>(SEED[0].id);
  const [search,    setSearch]    = useState("");
  const [filterSt,  setFilterSt]  = useState<POSStatus | "All">("All");
  const [filterStation, setFilterStation] = useState("All");
  const [modal,     setModal]     = useState<"create" | "edit" | "delete" | "reassign" | null>(null);
  const [toast,     setToast]     = useState<string | null>(null);

  const filtered = machines.filter(m => {
    const term = search.toLowerCase();
    const nameMatch = m.serial.toLowerCase().includes(term) || m.make.toLowerCase().includes(term) || m.model.toLowerCase().includes(term) || m.id.toLowerCase().includes(term);
    const stMatch   = filterSt === "All" || m.status === filterSt;
    const stationMatch = filterStation === "All" || m.currentStationId === filterStation;
    return nameMatch && stMatch && stationMatch;
  });

  const active = machines.find(m => m.id === selected) ?? null;

  function upsert(p: POSMachine) {
    setMachines(prev => {
      const idx = prev.findIndex(x => x.id === p.id);
      if (idx >= 0) { const n = [...prev]; n[idx] = p; return n; }
      return [...prev, p];
    });
    setSelected(p.id);
    setToast(modal === "create" ? `${p.serial} registered` : modal === "reassign" ? `${p.serial} reassigned` : `${p.serial} updated`);
    setModal(null);
  }

  function deleteActive() {
    if (!active) return;
    setMachines(prev => prev.filter(m => m.id !== active.id));
    setSelected(machines.find(m => m.id !== active.id)?.id ?? null);
    setToast(`${active.serial} removed`);
    setModal(null);
  }

  // Summary counts
  const counts = {
    active:      machines.filter(m => m.status === "Active").length,
    idle:        machines.filter(m => m.status === "Idle").length,
    maintenance: machines.filter(m => m.status === "Maintenance").length,
    outdated:    machines.filter(m => m.appVersion !== APP_VERSIONS[0]).length,
  };

  return (
    <>
      <style>{`
        @keyframes fadeUp { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
        * { box-sizing:border-box; }
      `}</style>

      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
      {modal === "create"   && <POSFormModal onSave={upsert} onClose={() => setModal(null)} />}
      {modal === "edit"     && active && <POSFormModal initial={active} onSave={upsert} onClose={() => setModal(null)} />}
      {modal === "delete"   && active && <DeleteModal serial={active.serial} onConfirm={deleteActive} onClose={() => setModal(null)} />}
      {modal === "reassign" && active && <ReassignModal pos={active} onSave={upsert} onClose={() => setModal(null)} />}

      <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "var(--background)", overflow: "hidden" }}>

        {/* Top bar */}
        <div style={{ padding: "24px 28px 0", flexShrink: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
            <div>
              <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--foreground)", margin: 0 }}>POS Machines</h1>
              <p style={{ fontSize: 13, color: "var(--muted-foreground)", margin: "3px 0 0" }}>
                {machines.length} machines · {counts.active} active · {counts.idle} idle · {counts.maintenance} in maintenance
                {counts.outdated > 0 && <span style={{ color: "#d97706", fontWeight: 600 }}> · {counts.outdated} need app update</span>}
              </p>
            </div>
            <button onClick={() => setModal("create")} style={{ height: 40, padding: "0 18px", borderRadius: 10, border: "none", background: "var(--primary)", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 7 }}>
              <Plus size={16} strokeWidth={2.5} /> Register POS
            </button>
          </div>
        </div>

        {/* Split pane */}
        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "320px 1fr", overflow: "hidden" }}>

          {/* Left — list */}
          <div style={{ borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--surface)" }}>
            {/* Filters */}
            <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 8, flexShrink: 0 }}>
              <div style={{ position: "relative" }}>
                <Search size={14} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "var(--muted-foreground)" }} />
                <input placeholder="Search serial, make, model…" value={search} onChange={e => setSearch(e.target.value)}
                  style={{ ...iCss, paddingLeft: 32, height: 36, fontSize: 13 }} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <select style={{ ...selCss, height: 34, fontSize: 12 }} value={filterSt} onChange={e => setFilterSt(e.target.value as POSStatus | "All")}>
                  {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s === "All" ? "All statuses" : s}</option>)}
                </select>
                <select style={{ ...selCss, height: 34, fontSize: 12 }} value={filterStation} onChange={e => setFilterStation(e.target.value)}>
                  <option value="All">All stations</option>
                  {STATIONS.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            </div>

            {/* Machine list */}
            <div style={{ flex: 1, overflowY: "auto" }}>
              {filtered.length === 0 && (
                <div style={{ padding: 24, textAlign: "center", color: "var(--muted-foreground)", fontSize: 13 }}>No machines match your filters.</div>
              )}
              {filtered.map(m => {
                const isActive = m.id === selected;
                const ss = statusStyle(m.status);
                const outdated = m.appVersion !== APP_VERSIONS[0];
                return (
                  <button key={m.id} onClick={() => setSelected(m.id)} style={{
                    display: "flex", alignItems: "center", width: "100%", textAlign: "left",
                    padding: "12px 14px", border: "none", cursor: "pointer",
                    borderBottom: "1px solid var(--border)",
                    background: isActive ? "color-mix(in srgb, var(--primary) 7%, transparent)" : "transparent",
                    borderLeft: `3px solid ${isActive ? "var(--primary)" : "transparent"}`,
                    transition: "background 0.12s",
                  }}>
                    {/* Icon */}
                    <div style={{ width: 38, height: 38, borderRadius: 10, background: ss.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginRight: 11 }}>
                      <Monitor size={17} color={ss.fg} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: isActive ? "var(--primary)" : "var(--foreground)", fontFamily: "monospace", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.serial}</div>
                      <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 1 }}>{m.make} {m.model}</div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3, flexShrink: 0, marginLeft: 8 }}>
                      <Badge label={m.status} bg={ss.bg} fg={ss.fg} />
                      {outdated && <span style={{ fontSize: 10, color: "#d97706", fontWeight: 600 }}>outdated</span>}
                    </div>
                    <ChevronRight size={14} color="var(--muted-foreground)" style={{ marginLeft: 6, flexShrink: 0 }} />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right — detail */}
          <div style={{ overflowY: "auto", background: "var(--surface)" }}>
            {active
              ? <DetailPanel
                  pos={active}
                  onEdit={() => setModal("edit")}
                  onDelete={() => setModal("delete")}
                  onReassign={() => setModal("reassign")}
                  onUpdate={updated => setMachines(prev => prev.map(m => m.id === updated.id ? updated : m))}
                />
              : (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--muted-foreground)" }}>
                  <Monitor size={40} style={{ marginBottom: 12, opacity: 0.25 }} />
                  <p style={{ fontSize: 14 }}>Select a POS machine to view details</p>
                </div>
              )
            }
          </div>
        </div>
      </div>
    </>
  );
}