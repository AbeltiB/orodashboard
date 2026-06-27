"use client";

import { useState } from "react";
import {
  User, Plus, Pencil, Trash2, X, Check, Search,
  AlertCircle, MapPin, Monitor, Wallet, ChevronRight,
  Eye, EyeOff, ChevronsUpDown, Calendar, Banknote,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Role = "Supervisor" | "Ticketer" | "Cashier";
type Sex  = "Male" | "Female";
type DeliveryMethod = "Bank Transfer" | "Cheque" | "Telebirr" | "Other";

type PettyCashEntry = {
  id: string;
  amount: number;
  date: string;
  method: DeliveryMethod;
  reference: string;
  note: string;
};

type Employee = {
  id: string;
  firstName: string;
  middleName: string;
  lastName: string;
  phone: string;
  email: string;
  password: string;
  fan: string;           // Fayda Alias Number — 16 digits, shown as XXXX-XXXX-XXXX-XXXX
  stationId: string;
  stationName: string;
  basicSalary: number;
  role: Role;
  accountNumber: string;
  employmentDate: string;
  sex: Sex;
  posSerial: string;
  posType: string;
  pettyCash: PettyCashEntry[];
};

// ─── Seed stations (would come from your stations store in production) ─────────

const STATIONS = [
  { id: "STN-001", name: "Meskel Square Terminal" },
  { id: "STN-002", name: "Bole Station" },
  { id: "STN-003", name: "Piassa Hub" },
];

const POS_MACHINES = [
  { serial: "POS-AA-001", typeName: "Verifone V240m",   stationId: "STN-001" },
  { serial: "POS-AA-002", typeName: "PAX A920",          stationId: "STN-001" },
  { serial: "POS-AA-003", typeName: "Ingenico Move 5000",stationId: "STN-002" },
  { serial: "POS-AA-004", typeName: "Verifone V240m",   stationId: "STN-003" },
];

// ─── Seed employees ───────────────────────────────────────────────────────────

const SEED: Employee[] = [
  {
    id: "EMP-001",
    firstName: "Abebe", middleName: "Girma", lastName: "Tadesse",
    phone: "0911234567", email: "abebe@adrash.et", password: "POS@1234",
    fan: "1234567890123456",
    stationId: "STN-001", stationName: "Meskel Square Terminal",
    basicSalary: 8500, role: "Supervisor",
    accountNumber: "1000123456789",
    employmentDate: "2021-03-15",
    sex: "Male",
    posSerial: "POS-AA-001", posType: "Verifone V240m",
    pettyCash: [
      { id: "pc1", amount: 2000, date: "2024-11-01", method: "Bank Transfer", reference: "TXN-001-2024", note: "Monthly ops float" },
      { id: "pc2", amount: 1500, date: "2024-12-10", method: "Telebirr", reference: "TLB-998877", note: "" },
    ],
  },
  {
    id: "EMP-002",
    firstName: "Tigist", middleName: "Haile", lastName: "Mekonen",
    phone: "0922345678", email: "tigist@adrash.et", password: "POS@5678",
    fan: "9876543210987654",
    stationId: "STN-001", stationName: "Meskel Square Terminal",
    basicSalary: 6200, role: "Ticketer",
    accountNumber: "1000987654321",
    employmentDate: "2022-07-01",
    sex: "Female",
    posSerial: "", posType: "",
    pettyCash: [],
  },
  {
    id: "EMP-003",
    firstName: "Dawit", middleName: "Tesfaye", lastName: "Bekele",
    phone: "0933456789", email: "dawit@adrash.et", password: "POS@9012",
    fan: "1111222233334444",
    stationId: "STN-002", stationName: "Bole Station",
    basicSalary: 6200, role: "Cashier",
    accountNumber: "1000555566667",
    employmentDate: "2023-01-20",
    sex: "Male",
    posSerial: "POS-AA-003", posType: "Ingenico Move 5000",
    pettyCash: [],
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uid() { return Math.random().toString(36).slice(2, 9); }

function fmtFAN(raw: string) {
  const d = raw.replace(/\D/g, "").slice(0, 16);
  return d.replace(/(.{4})/g, "$1-").replace(/-$/, "");
}

function fmtCurrency(n: number) {
  return new Intl.NumberFormat("en-ET", { minimumFractionDigits: 2 }).format(n) + " ETB";
}

function initials(emp: Employee) {
  return (emp.firstName.charAt(0) + emp.lastName.charAt(0)).toUpperCase();
}

function roleColor(role: Role): { bg: string; fg: string } {
  return role === "Supervisor"
    ? { bg: "#ede9fe", fg: "#7c3aed" }
    : role === "Cashier"
    ? { bg: "#fef3c7", fg: "#d97706" }
    : { bg: "#dbeafe", fg: "#1d4ed8" };
}

// ─── Shared UI atoms ──────────────────────────────────────────────────────────

const iCss: React.CSSProperties = {
  width: "100%", height: 42, padding: "0 12px",
  border: "1.5px solid var(--border)", borderRadius: 10,
  background: "var(--surface)", color: "var(--foreground)",
  fontSize: 14, outline: "none",
};
const selCss: React.CSSProperties = { ...iCss, cursor: "pointer" };

function Field({ label, half, children }: { label: string; half?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14, gridColumn: half ? "span 1" : "span 2" }}>
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
      <div style={{ background: "var(--surface)", borderRadius: 18, width: "100%", maxWidth: wide ? 700 : 540, boxShadow: "0 24px 60px rgb(0 0 0 / 0.18)", border: "1px solid var(--border)", maxHeight: "92vh", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 24px 0", flexShrink: 0 }}>
          <span style={{ fontSize: 17, fontWeight: 700, color: "var(--foreground)" }}>{title}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", padding: 4 }}><X size={18} /></button>
        </div>
        <div style={{ padding: "20px 24px 24px", overflowY: "auto", flex: 1 }}>{children}</div>
      </div>
    </div>
  );
}

// ─── Employee form modal ──────────────────────────────────────────────────────

function EmployeeFormModal({ initial, onSave, onClose }: { initial?: Employee; onSave: (e: Employee) => void; onClose: () => void }) {
  const blank: Employee = {
    id: "", firstName: "", middleName: "", lastName: "",
    phone: "", email: "", password: "", fan: "",
    stationId: "", stationName: "", basicSalary: 0, role: "Ticketer",
    accountNumber: "", employmentDate: "", sex: "Male",
    posSerial: "", posType: "", pettyCash: [],
  };
  const [form, setForm] = useState<Employee>(initial ?? blank);
  const [showPwd, setShowPwd] = useState(false);
  const set = <K extends keyof Employee>(k: K, v: Employee[K]) => setForm(f => ({ ...f, [k]: v }));

  const availablePOS = POS_MACHINES.filter(p => p.stationId === form.stationId);

  const valid = form.firstName.trim() && form.lastName.trim() && form.phone.trim() && form.stationId && form.role;

  function save() {
    if (!valid) return;
    const station = STATIONS.find(s => s.id === form.stationId);
    onSave({ ...form, id: form.id || `EMP-${String(Date.now()).slice(-4)}`, stationName: station?.name ?? "" });
  }

  return (
    <Modal title={initial ? "Edit employee" : "New employee"} wide onClose={onClose}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>

        {/* Name row */}
        <Field label="First name *" half><input style={iCss} value={form.firstName} onChange={e => set("firstName", e.target.value)} autoFocus /></Field>
        <Field label="Middle name" half><input style={iCss} value={form.middleName} onChange={e => set("middleName", e.target.value)} /></Field>
        <Field label="Last name *" half><input style={iCss} value={form.lastName} onChange={e => set("lastName", e.target.value)} /></Field>
        <Field label="Sex" half>
          <select style={selCss} value={form.sex} onChange={e => set("sex", e.target.value as Sex)}>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
          </select>
        </Field>

        {/* Contact */}
        <Field label="Phone *" half><input style={iCss} value={form.phone} onChange={e => set("phone", e.target.value)} placeholder="09XXXXXXXX" /></Field>
        <Field label="Email" half><input style={iCss} value={form.email} onChange={e => set("email", e.target.value)} placeholder="name@company.et" /></Field>

        {/* FAN */}
        <Field label="FAN — Fayda Alias Number">
          <input style={{ ...iCss, letterSpacing: "0.12em", fontFamily: "monospace" }}
            value={fmtFAN(form.fan)}
            onChange={e => set("fan", e.target.value.replace(/\D/g, "").slice(0, 16))}
            placeholder="XXXX-XXXX-XXXX-XXXX"
            maxLength={19}
          />
        </Field>

        {/* POS password */}
        <Field label="POS login password" half>
          <div style={{ position: "relative" }}>
            <input style={{ ...iCss, paddingRight: 40 }} type={showPwd ? "text" : "password"} value={form.password} onChange={e => set("password", e.target.value)} />
            <button onClick={() => setShowPwd(v => !v)} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", display: "flex" }}>
              {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </Field>

        {/* Role */}
        <Field label="Role *" half>
          <select style={selCss} value={form.role} onChange={e => set("role", e.target.value as Role)}>
            <option value="Supervisor">Supervisor</option>
            <option value="Ticketer">Ticketer</option>
            <option value="Cashier">Cashier</option>
          </select>
        </Field>

        {/* Employment info */}
        <Field label="Employment date" half>
          <input style={iCss} type="date" value={form.employmentDate} onChange={e => set("employmentDate", e.target.value)} />
        </Field>
        <Field label="Basic salary (ETB)" half>
          <input style={iCss} type="number" value={form.basicSalary || ""} onChange={e => set("basicSalary", parseFloat(e.target.value) || 0)} placeholder="0.00" />
        </Field>
        <Field label="Bank account number" half>
          <input style={iCss} value={form.accountNumber} onChange={e => set("accountNumber", e.target.value)} placeholder="1000XXXXXXXXX" />
        </Field>

        {/* Station */}
        <Field label="Station *">
          <select style={selCss} value={form.stationId} onChange={e => { set("stationId", e.target.value); set("posSerial", ""); set("posType", ""); }}>
            <option value="">Select station…</option>
            {STATIONS.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>

        {/* POS machine */}
        <Field label="POS machine assigned">
          <select style={selCss} value={form.posSerial} onChange={e => {
            const pos = availablePOS.find(p => p.serial === e.target.value);
            set("posSerial", e.target.value);
            set("posType", pos?.typeName ?? "");
          }} disabled={!form.stationId}>
            <option value="">None</option>
            {availablePOS.map(p => <option key={p.serial} value={p.serial}>{p.serial} — {p.typeName}</option>)}
          </select>
          {form.stationId && availablePOS.length === 0 && (
            <p style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 4 }}>No POS machines registered for this station yet.</p>
          )}
        </Field>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
        <button onClick={onClose} style={{ height: 40, padding: "0 18px", borderRadius: 10, border: "1.5px solid var(--border)", background: "var(--surface)", fontSize: 14, cursor: "pointer", color: "var(--foreground)" }}>Cancel</button>
        <button onClick={save} disabled={!valid} style={{ height: 40, padding: "0 22px", borderRadius: 10, border: "none", background: "var(--primary)", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", opacity: valid ? 1 : 0.5 }}>
          {initial ? "Save changes" : "Create employee"}
        </button>
      </div>
    </Modal>
  );
}

// ─── Delete confirm ───────────────────────────────────────────────────────────

function DeleteModal({ name, onConfirm, onClose }: { name: string; onConfirm: () => void; onClose: () => void }) {
  return (
    <Modal title="Remove employee" onClose={onClose}>
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start", marginBottom: 24 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: "#fee2e2", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <AlertCircle size={20} color="#dc2626" />
        </div>
        <p style={{ fontSize: 14, color: "var(--muted-foreground)", lineHeight: 1.6, margin: 0 }}>
          Permanently remove <strong style={{ color: "var(--foreground)" }}>{name}</strong>? Their petty cash history and POS assignment will also be removed. This cannot be undone.
        </p>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <button onClick={onClose} style={{ height: 40, padding: "0 18px", borderRadius: 10, border: "1.5px solid var(--border)", background: "var(--surface)", fontSize: 14, cursor: "pointer", color: "var(--foreground)" }}>Cancel</button>
        <button onClick={onConfirm} style={{ height: 40, padding: "0 22px", borderRadius: 10, border: "none", background: "#dc2626", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Remove employee</button>
      </div>
    </Modal>
  );
}

// ─── Petty Cash tab ───────────────────────────────────────────────────────────

function PettyCashTab({ emp, onChange }: { emp: Employee; onChange: (p: PettyCashEntry[]) => void }) {
  if (emp.role !== "Supervisor") {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 0", color: "var(--muted-foreground)" }}>
        <Wallet size={32} style={{ marginBottom: 10, opacity: 0.3 }} />
        <p style={{ fontSize: 13 }}>Petty cash is only tracked for Supervisors.</p>
      </div>
    );
  }

  const blank = { amount: 0, date: new Date().toISOString().slice(0, 10), method: "Bank Transfer" as DeliveryMethod, reference: "", note: "" };
  const [adding, setAdding] = useState(false);
  const [form, setForm]     = useState(blank);
  const set = <K extends keyof typeof blank>(k: K, v: (typeof blank)[K]) => setForm(f => ({ ...f, [k]: v }));

  const total = emp.pettyCash.reduce((s, e) => s + e.amount, 0);

  function add() {
    if (!form.amount || !form.date || !form.reference.trim()) return;
    onChange([...emp.pettyCash, { ...form, id: uid() }]);
    setAdding(false); setForm(blank);
  }
  function remove(id: string) { onChange(emp.pettyCash.filter(p => p.id !== id)); }

  return (
    <div>
      {/* Running balance card */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "color-mix(in srgb, var(--primary) 7%, transparent)", border: "1px solid color-mix(in srgb, var(--primary) 20%, transparent)", borderRadius: 12, padding: "14px 18px", marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--primary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>Total petty cash received</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: "var(--foreground)" }}>{fmtCurrency(total)}</div>
        </div>
        <Banknote size={32} color="var(--primary)" style={{ opacity: 0.4 }} />
      </div>

      {/* Disbursement log */}
      {emp.pettyCash.length === 0 && !adding && (
        <p style={{ fontSize: 13, color: "var(--muted-foreground)", marginBottom: 16 }}>No disbursements recorded yet.</p>
      )}

      {emp.pettyCash.map((entry, i) => (
        <div key={entry.id} style={{ display: "flex", gap: 14, alignItems: "flex-start", padding: "12px 14px", borderRadius: 10, border: "1px solid var(--border)", marginBottom: 8, background: "var(--background)" }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: "#dcfce7", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#16a34a" }}>#{i + 1}</span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 3 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: "var(--foreground)" }}>{fmtCurrency(entry.amount)}</span>
              <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>{entry.date}</span>
            </div>
            <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
              <span style={{ fontWeight: 600, color: "var(--foreground)" }}>{entry.method}</span>
              {" · "}<span style={{ fontFamily: "monospace" }}>{entry.reference}</span>
            </div>
            {entry.note && <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 2, fontStyle: "italic" }}>{entry.note}</div>}
          </div>
          <button onClick={() => remove(entry.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#dc2626", padding: 4, flexShrink: 0, display: "flex" }}><Trash2 size={14} /></button>
        </div>
      ))}

      {/* Add form */}
      {adding ? (
        <div style={{ border: "1.5px solid var(--primary)", borderRadius: 12, padding: 16, marginBottom: 8, background: "var(--surface)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
            <Field label="Amount (ETB) *" half>
              <input style={iCss} type="number" value={form.amount || ""} onChange={e => set("amount", parseFloat(e.target.value) || 0)} autoFocus placeholder="0.00" />
            </Field>
            <Field label="Date *" half>
              <input style={iCss} type="date" value={form.date} onChange={e => set("date", e.target.value)} />
            </Field>
            <Field label="Delivery method *" half>
              <select style={selCss} value={form.method} onChange={e => set("method", e.target.value as DeliveryMethod)}>
                <option>Bank Transfer</option>
                <option>Cheque</option>
                <option>Telebirr</option>
                <option>Other</option>
              </select>
            </Field>
            <Field label="Reference number *" half>
              <input style={{ ...iCss, fontFamily: "monospace" }} value={form.reference} onChange={e => set("reference", e.target.value)} placeholder="TXN-XXXX / CHQ-XXXX" />
            </Field>
            <Field label="Note (optional)">
              <input style={iCss} value={form.note} onChange={e => set("note", e.target.value)} />
            </Field>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={add} style={{ height: 36, padding: "0 18px", borderRadius: 8, border: "none", background: "var(--primary)", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Record disbursement</button>
            <button onClick={() => { setAdding(false); setForm(blank); }} style={{ height: 36, padding: "0 14px", borderRadius: 8, border: "1.5px solid var(--border)", background: "var(--surface)", fontSize: 13, cursor: "pointer", color: "var(--foreground)" }}>Cancel</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} style={{ display: "flex", alignItems: "center", gap: 6, height: 36, padding: "0 14px", borderRadius: 8, border: "1.5px dashed var(--border)", background: "none", fontSize: 13, color: "var(--primary)", cursor: "pointer", fontWeight: 500 }}>
          <Plus size={15} /> Record disbursement
        </button>
      )}
    </div>
  );
}

// ─── Detail panel ─────────────────────────────────────────────────────────────

type Tab = "overview" | "station" | "pos" | "pettycash";

function DetailPanel({ emp, onEdit, onDelete, onUpdate }: {
  emp: Employee;
  onEdit: () => void;
  onDelete: () => void;
  onUpdate: (e: Employee) => void;
}) {
  const [tab, setTab]   = useState<Tab>("overview");
  const [showPwd, setShowPwd] = useState(false);
  const rc = roleColor(emp.role);
  const fullName = [emp.firstName, emp.middleName, emp.lastName].filter(Boolean).join(" ");

  function TabBtn({ id, label }: { id: Tab; label: string }) {
    const active = tab === id;
    return (
      <button onClick={() => setTab(id)} style={{ height: 34, padding: "0 14px", borderRadius: 8, border: "none", background: active ? "color-mix(in srgb, var(--primary) 10%, transparent)" : "none", color: active ? "var(--primary)" : "var(--muted-foreground)", fontSize: 13, fontWeight: active ? 600 : 400, cursor: "pointer" }}>
        {label}
      </button>
    );
  }

  function InfoRow({ label, value, mono }: { label: string; value: string | number; mono?: boolean }) {
    return (
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
        <span style={{ fontSize: 12, color: "var(--muted-foreground)", fontWeight: 500 }}>{label}</span>
        <span style={{ fontSize: 14, color: "var(--foreground)", fontWeight: 500, fontFamily: mono ? "monospace" : "inherit", letterSpacing: mono ? "0.06em" : 0 }}>{value}</span>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header */}
      <div style={{ padding: "28px 28px 0", flexShrink: 0 }}>
        <div style={{ display: "flex", gap: 16, alignItems: "flex-start", marginBottom: 16 }}>
          {/* Avatar */}
          <div style={{ width: 52, height: 52, borderRadius: 14, background: rc.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <span style={{ fontSize: 18, fontWeight: 800, color: rc.fg }}>{initials(emp)}</span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", color: "var(--muted-foreground)", textTransform: "uppercase", marginBottom: 3 }}>{emp.id}</div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--foreground)", margin: 0 }}>{fullName}</h2>
            <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
              <Badge label={emp.role} bg={rc.bg} fg={rc.fg} />
              <Badge label={emp.sex} bg="#f1f5f9" fg="#475569" />
              {emp.stationName && <Badge label={emp.stationName} bg="#f0fdf4" fg="#15803d" />}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            <button onClick={onEdit} style={{ height: 34, padding: "0 14px", borderRadius: 8, border: "1.5px solid var(--border)", background: "var(--surface)", fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 5, color: "var(--foreground)", fontWeight: 500 }}>
              <Pencil size={13} /> Edit
            </button>
            <button onClick={onDelete} style={{ height: 34, padding: "0 14px", borderRadius: 8, border: "1.5px solid #fecaca", background: "#fff5f5", fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 5, color: "#dc2626", fontWeight: 500 }}>
              <Trash2 size={13} /> Remove
            </button>
          </div>
        </div>

        {/* Quick stat row */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 20 }}>
          {[
            { label: "Basic salary",  value: fmtCurrency(emp.basicSalary), icon: <Banknote size={13} /> },
            { label: "Station",       value: emp.stationName || "—",        icon: <MapPin size={13} /> },
            { label: "Petty cash",    value: emp.role === "Supervisor" ? fmtCurrency(emp.pettyCash.reduce((s, e) => s + e.amount, 0)) : "N/A", icon: <Wallet size={13} /> },
          ].map(s => (
            <div key={s.label} style={{ background: "var(--background)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4, color: "var(--muted-foreground)", fontSize: 11, marginBottom: 4 }}>{s.icon}{s.label}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--foreground)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Tab bar */}
        <div style={{ display: "flex", gap: 2, borderBottom: "1px solid var(--border)" }}>
          <TabBtn id="overview"  label="Overview" />
          <TabBtn id="station"   label="Station & POS" />
          <TabBtn id="pettycash" label="Petty Cash" />
        </div>
      </div>

      {/* Tab body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "22px 28px 28px" }}>

        {/* ── Overview ── */}
        {tab === "overview" && (
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--muted-foreground)", marginBottom: 8 }}>Personal</p>
            <InfoRow label="Full name"         value={fullName} />
            <InfoRow label="Sex"               value={emp.sex} />
            <InfoRow label="Phone"             value={emp.phone} mono />
            <InfoRow label="Email"             value={emp.email || "—"} />
            <InfoRow label="FAN"               value={fmtFAN(emp.fan) || "—"} mono />

            <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--muted-foreground)", marginBottom: 8, marginTop: 20 }}>Employment</p>
            <InfoRow label="Employee ID"       value={emp.id} mono />
            <InfoRow label="Role"              value={emp.role} />
            <InfoRow label="Employment date"   value={emp.employmentDate || "—"} />
            <InfoRow label="Basic salary"      value={fmtCurrency(emp.basicSalary)} />
            <InfoRow label="Bank account"      value={emp.accountNumber || "—"} mono />

            <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--muted-foreground)", marginBottom: 8, marginTop: 20 }}>POS credentials</p>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
              <span style={{ fontSize: 12, color: "var(--muted-foreground)", fontWeight: 500 }}>POS password</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 14, fontFamily: "monospace", color: "var(--foreground)", letterSpacing: showPwd ? "0.04em" : "0.2em" }}>
                  {showPwd ? (emp.password || "—") : (emp.password ? "••••••••" : "—")}
                </span>
                {emp.password && (
                  <button onClick={() => setShowPwd(v => !v)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", display: "flex", padding: 2 }}>
                    {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Station & POS ── */}
        {tab === "station" && (
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--muted-foreground)", marginBottom: 12 }}>Assigned station</p>
            {emp.stationId ? (
              <div style={{ display: "flex", gap: 14, alignItems: "center", padding: "14px 16px", borderRadius: 12, border: "1px solid var(--border)", background: "var(--background)", marginBottom: 20 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: "#dbeafe", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <MapPin size={18} color="#1d4ed8" />
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "var(--foreground)" }}>{emp.stationName}</div>
                  <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>{emp.stationId}</div>
                </div>
              </div>
            ) : (
              <p style={{ fontSize: 13, color: "var(--muted-foreground)", marginBottom: 20 }}>No station assigned.</p>
            )}

            <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--muted-foreground)", marginBottom: 12 }}>POS machine</p>
            {emp.posSerial ? (
              <div style={{ display: "flex", gap: 14, alignItems: "center", padding: "14px 16px", borderRadius: 12, border: "1px solid var(--border)", background: "var(--background)" }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: "#f0fdf4", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Monitor size={18} color="#16a34a" />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "var(--foreground)", fontFamily: "monospace" }}>{emp.posSerial}</div>
                  <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>{emp.posType}</div>
                </div>
                <span style={{ display: "inline-flex", alignItems: "center", padding: "2px 10px", borderRadius: 999, fontSize: 11, fontWeight: 600, background: "#dcfce7", color: "#16a34a" }}>Assigned</span>
              </div>
            ) : (
              <p style={{ fontSize: 13, color: "var(--muted-foreground)" }}>No POS machine assigned. Edit the employee to assign one.</p>
            )}
          </div>
        )}

        {/* ── Petty Cash ── */}
        {tab === "pettycash" && (
          <PettyCashTab emp={emp} onChange={p => onUpdate({ ...emp, pettyCash: p })} />
        )}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const ROLES: Role[] = ["Supervisor", "Ticketer", "Cashier"];

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>(SEED);
  const [selected, setSelected]   = useState<string | null>(SEED[0].id);
  const [search, setSearch]       = useState("");
  const [filterRole, setFilterRole] = useState<Role | "All">("All");
  const [filterStation, setFilterStation] = useState("All");
  const [modal, setModal]         = useState<"create" | "edit" | "delete" | null>(null);
  const [toast, setToast]         = useState<string | null>(null);

  const filtered = employees.filter(e => {
    const term = search.toLowerCase();
    const nameMatch = `${e.firstName} ${e.middleName} ${e.lastName}`.toLowerCase().includes(term) || e.phone.includes(term) || e.id.toLowerCase().includes(term);
    const roleMatch = filterRole === "All" || e.role === filterRole;
    const stationMatch = filterStation === "All" || e.stationId === filterStation;
    return nameMatch && roleMatch && stationMatch;
  });

  const active = employees.find(e => e.id === selected) ?? null;

  function upsert(emp: Employee) {
    setEmployees(prev => {
      const idx = prev.findIndex(x => x.id === emp.id);
      if (idx >= 0) { const n = [...prev]; n[idx] = emp; return n; }
      return [...prev, emp];
    });
    setSelected(emp.id);
    setToast(modal === "create" ? `${emp.firstName} ${emp.lastName} added` : `${emp.firstName} ${emp.lastName} updated`);
    setModal(null);
  }

  function deleteActive() {
    if (!active) return;
    const name = `${active.firstName} ${active.lastName}`;
    setEmployees(prev => prev.filter(e => e.id !== active.id));
    setSelected(employees.find(e => e.id !== active.id)?.id ?? null);
    setToast(`${name} removed`);
    setModal(null);
  }

  return (
    <>
      <style>{`
        @keyframes fadeUp { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
        * { box-sizing:border-box; }
        input[type=number]::-webkit-inner-spin-button { -webkit-appearance:none; }
      `}</style>

      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
      {modal === "create" && <EmployeeFormModal onSave={upsert} onClose={() => setModal(null)} />}
      {modal === "edit"   && active && <EmployeeFormModal initial={active} onSave={upsert} onClose={() => setModal(null)} />}
      {modal === "delete" && active && <DeleteModal name={`${active.firstName} ${active.lastName}`} onConfirm={deleteActive} onClose={() => setModal(null)} />}

      <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "var(--background)", overflow: "hidden" }}>

        {/* Top bar */}
        <div style={{ padding: "24px 28px 0", flexShrink: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div>
              <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--foreground)", margin: 0 }}>Employees</h1>
              <p style={{ fontSize: 13, color: "var(--muted-foreground)", margin: "3px 0 0" }}>
                {employees.length} employee{employees.length !== 1 ? "s" : ""} across {STATIONS.length} stations
              </p>
            </div>
            <button onClick={() => setModal("create")} style={{ height: 40, padding: "0 18px", borderRadius: 10, border: "none", background: "var(--primary)", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 7 }}>
              <Plus size={16} strokeWidth={2.5} /> New employee
            </button>
          </div>
        </div>

        {/* Split pane */}
        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "340px 1fr", overflow: "hidden" }}>

          {/* Left list */}
          <div style={{ borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--surface)" }}>
            {/* Filters */}
            <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 8, flexShrink: 0 }}>
              <div style={{ position: "relative" }}>
                <Search size={14} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "var(--muted-foreground)" }} />
                <input placeholder="Search name, phone, ID…" value={search} onChange={e => setSearch(e.target.value)}
                  style={{ ...iCss, paddingLeft: 32, height: 36, fontSize: 13 }} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <select style={{ ...selCss, height: 34, fontSize: 12 }} value={filterRole} onChange={e => setFilterRole(e.target.value as Role | "All")}>
                  <option value="All">All roles</option>
                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
                <select style={{ ...selCss, height: 34, fontSize: 12 }} value={filterStation} onChange={e => setFilterStation(e.target.value)}>
                  <option value="All">All stations</option>
                  {STATIONS.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            </div>

            {/* Employee list */}
            <div style={{ flex: 1, overflowY: "auto" }}>
              {filtered.length === 0 && (
                <div style={{ padding: 24, textAlign: "center", color: "var(--muted-foreground)", fontSize: 13 }}>No employees match your filters.</div>
              )}
              {filtered.map(emp => {
                const isActive = emp.id === selected;
                const rc = roleColor(emp.role);
                return (
                  <button key={emp.id} onClick={() => setSelected(emp.id)} style={{
                    display: "flex", alignItems: "center", width: "100%", textAlign: "left",
                    padding: "12px 14px", border: "none", cursor: "pointer",
                    borderBottom: "1px solid var(--border)",
                    background: isActive ? "color-mix(in srgb, var(--primary) 7%, transparent)" : "transparent",
                    borderLeft: `3px solid ${isActive ? "var(--primary)" : "transparent"}`,
                    transition: "background 0.12s",
                  }}>
                    {/* Avatar */}
                    <div style={{ width: 38, height: 38, borderRadius: 11, background: rc.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginRight: 11 }}>
                      <span style={{ fontSize: 13, fontWeight: 800, color: rc.fg }}>{initials(emp)}</span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: isActive ? "var(--primary)" : "var(--foreground)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {emp.firstName} {emp.lastName}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 1 }}>
                        {emp.role} · {emp.stationName || "No station"}
                      </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3, flexShrink: 0, marginLeft: 6 }}>
                      <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>{emp.posSerial ? "POS ✓" : "No POS"}</span>
                    </div>
                    <ChevronRight size={14} color="var(--muted-foreground)" style={{ marginLeft: 6, flexShrink: 0 }} />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right detail */}
          <div style={{ overflowY: "auto", background: "var(--surface)" }}>
            {active
              ? <DetailPanel
                  emp={active}
                  onEdit={() => setModal("edit")}
                  onDelete={() => setModal("delete")}
                  onUpdate={updated => setEmployees(prev => prev.map(e => e.id === updated.id ? updated : e))}
                />
              : (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--muted-foreground)" }}>
                  <User size={40} style={{ marginBottom: 12, opacity: 0.3 }} />
                  <p style={{ fontSize: 14 }}>Select an employee to view their profile</p>
                </div>
              )
            }
          </div>
        </div>
      </div>
    </>
  );
}