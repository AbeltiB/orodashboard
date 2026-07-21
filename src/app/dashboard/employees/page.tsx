"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  User, Plus, Pencil, Trash2, X, Check, Search,
  AlertCircle, MapPin, Monitor, Wallet, ChevronRight,
  Eye, EyeOff, ChevronsUpDown, Calendar, Banknote,
  Loader2, Users, Shield, CreditCard,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type APIRole = "SUPERVISOR" | "TICKETER" | "CASHIER";
type APISex = "MALE" | "FEMALE";
type APIDeliveryMethod = "BANK_TRANSFER" | "CHEQUE" | "TELEBIRR" | "OTHER";

const API_ROLES: APIRole[] = ["SUPERVISOR", "TICKETER", "CASHIER"];
const API_SEXES: APISex[] = ["MALE", "FEMALE"];
const API_METHODS: APIDeliveryMethod[] = ["BANK_TRANSFER", "CHEQUE", "TELEBIRR", "OTHER"];

function roleLabel(r: APIRole) {
  return r === "SUPERVISOR" ? "Supervisor" : r === "TICKETER" ? "Ticketer" : "Cashier";
}
function sexLabel(s: APISex) {
  return s === "MALE" ? "Male" : "Female";
}
function methodLabel(m: APIDeliveryMethod) {
  const map: Record<APIDeliveryMethod, string> = {
    BANK_TRANSFER: "Bank Transfer",
    CHEQUE: "Cheque",
    TELEBIRR: "Telebirr",
    OTHER: "Other",
  };
  return map[m];
}

type PettyCashEntry = {
  id: string;
  amount: number;
  date: string;
  method: APIDeliveryMethod;
  reference: string;
  note?: string | null;
};

type StationOption = { id: string; name: string; code: string };
type PosOption = { id: string; serial: string; code: string; make: string; model: string; stationId?: string | null };

type Employee = {
  id: string;
  code: string;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  fullName: string;
  phone: string;
  email?: string | null;
  posPassword?: string | null;
  fan?: string | null;
  stationId?: string | null;
  station?: StationOption | null;
  basicSalary: number;
  role: APIRole;
  accountNumber?: string | null;
  employmentDate?: string | null;
  sex: APISex;
  posMachines: PosOption[];
  pettyCash: PettyCashEntry[];
};

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

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error ?? `Request failed: ${res.status}`);
  return json as T;
}

function normalizePhone(v: string) {
  const digits = v.replace(/\D/g, "");
  if (digits.startsWith("09") && digits.length === 10) return `+251${digits.slice(1)}`;
  if (digits.startsWith("9") && digits.length === 9) return `+251${digits}`;
  return v;
}

function roleColor(role: APIRole): { bg: string; fg: string } {
  return role === "SUPERVISOR"
    ? { bg: "#ede9fe", fg: "#7c3aed" }
    : role === "CASHIER"
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

type EmployeeFormData = {
  firstName: string;
  middleName: string;
  lastName: string;
  phone: string;
  email: string;
  posPassword: string;
  fan: string;
  stationId: string;
  basicSalary: number;
  role: APIRole;
  accountNumber: string;
  employmentDate: string;
  sex: APISex;
};

function EmployeeFormModal({
  initial,
  stations,
  posMachines,
  onSaved,
  onClose,
}: {
  initial?: Employee;
  stations: StationOption[];
  posMachines: PosOption[];
  onSaved: () => void;
  onClose: () => void;
}) {
  const blank: EmployeeFormData = {
    firstName: "", middleName: "", lastName: "",
    phone: "", email: "", posPassword: "", fan: "",
    stationId: "", basicSalary: 0, role: "TICKETER",
    accountNumber: "", employmentDate: "", sex: "MALE",
  };
  const [form, setForm] = useState<EmployeeFormData>({
    firstName: initial?.firstName ?? "",
    middleName: initial?.middleName ?? "",
    lastName: initial?.lastName ?? "",
    phone: initial?.phone ?? "",
    email: initial?.email ?? "",
    posPassword: initial?.posPassword ?? "",
    fan: initial?.fan ?? "",
    stationId: initial?.stationId ?? "",
    basicSalary: initial?.basicSalary ?? 0,
    role: initial?.role ?? "TICKETER",
    accountNumber: initial?.accountNumber ?? "",
    employmentDate: initial?.employmentDate ? initial.employmentDate.slice(0, 10) : "",
    sex: initial?.sex ?? "MALE",
  });
  const [selectedPosId, setSelectedPosId] = useState<string | null>(
    initial?.posMachines?.[0]?.id ?? null
  );
  const [showPwd, setShowPwd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof EmployeeFormData>(k: K, v: EmployeeFormData[K]) =>
    setForm(f => ({ ...f, [k]: v }));

  const availablePOS = posMachines.filter(p => p.stationId === form.stationId);

  const phoneOk = /^\+251[79]\d{8}$/.test(normalizePhone(form.phone.trim()));
  const valid =
    form.firstName.trim() &&
    form.lastName.trim() &&
    phoneOk &&
    form.stationId &&
    form.role &&
    form.basicSalary > 0;

  async function save() {
    if (!valid || saving) return;
    setSaving(true); setError(null);
    try {
      const payload = {
        firstName: form.firstName.trim(),
        middleName: form.middleName.trim() || undefined,
        lastName: form.lastName.trim(),
        phone: normalizePhone(form.phone.trim()),
        email: form.email.trim() || undefined,
        posPassword: form.posPassword.trim() || undefined,
        fan: form.fan.replace(/\D/g, "").slice(0, 16) || undefined,
        stationId: form.stationId || undefined,
        role: form.role,
        sex: form.sex,
        basicSalary: form.basicSalary,
        accountNumber: form.accountNumber.trim() || undefined,
        employmentDate: form.employmentDate || undefined,
      };

      let savedId = initial?.id;
      if (initial) {
        await apiFetch(`/api/employees/${initial.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      } else {
        const created = await apiFetch<{ id: string }>("/api/employees", { method: "POST", body: JSON.stringify(payload) });
        savedId = created.id;
      }

      if (selectedPosId && savedId) {
        await apiFetch(`/api/pos-machines/${selectedPosId}/assign`, {
          method: "POST",
          body: JSON.stringify({
            employeeId: savedId,
            stationId: form.stationId || null,
            fromDate: new Date().toISOString().slice(0, 10),
            remark: "",
          }),
        });
      }

      onSaved();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={initial ? "Edit employee" : "New employee"} wide onClose={onClose}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>

        {/* Name row */}
        <Field label="First name *" half><input style={iCss} value={form.firstName} onChange={e => set("firstName", e.target.value)} autoFocus /></Field>
        <Field label="Middle name" half><input style={iCss} value={form.middleName} onChange={e => set("middleName", e.target.value)} /></Field>
        <Field label="Last name *" half><input style={iCss} value={form.lastName} onChange={e => set("lastName", e.target.value)} /></Field>
        <Field label="Sex" half>
          <select style={selCss} value={form.sex} onChange={e => set("sex", e.target.value as APISex)}>
            {API_SEXES.map(s => <option key={s} value={s}>{sexLabel(s)}</option>)}
          </select>
        </Field>

        {/* Contact */}
        <Field label="Phone *" half><input style={iCss} value={form.phone} onChange={e => set("phone", e.target.value)} placeholder="+251XXXXXXXXX" /></Field>
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
            <input style={{ ...iCss, paddingRight: 40 }} type={showPwd ? "text" : "password"} value={form.posPassword} onChange={e => set("posPassword", e.target.value)} />
            <button onClick={() => setShowPwd(v => !v)} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", display: "flex" }}>
              {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </Field>

        {/* Role */}
        <Field label="Role *" half>
          <select style={selCss} value={form.role} onChange={e => set("role", e.target.value as APIRole)}>
            {API_ROLES.map(r => <option key={r} value={r}>{roleLabel(r)}</option>)}
          </select>
        </Field>

        {/* Employment info */}
        <Field label="Employment date" half>
          <input style={iCss} type="date" value={form.employmentDate} onChange={e => set("employmentDate", e.target.value)} />
        </Field>
        <Field label="Basic salary (ETB) *" half>
          <input style={iCss} type="number" value={form.basicSalary || ""} onChange={e => set("basicSalary", parseFloat(e.target.value) || 0)} placeholder="0.00" />
        </Field>
        <Field label="Bank account number" half>
          <input style={iCss} value={form.accountNumber} onChange={e => set("accountNumber", e.target.value)} placeholder="1000XXXXXXXXX" />
        </Field>

        {/* Station */}
        <Field label="Station *">
          <select style={selCss} value={form.stationId} onChange={e => { set("stationId", e.target.value); setSelectedPosId(null); }}>
            <option value="">Select station…</option>
            {stations.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>

        {/* POS machine */}
        <Field label="POS machine assigned">
          <select style={selCss} value={selectedPosId ?? ""} onChange={e => setSelectedPosId(e.target.value || null)} disabled={!form.stationId}>
            <option value="">None</option>
            {availablePOS.map(p => <option key={p.id} value={p.id}>{p.serial} — {p.make} {p.model}</option>)}
          </select>
          {form.stationId && availablePOS.length === 0 && (
            <p style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 4 }}>No POS machines registered for this station yet.</p>
          )}
        </Field>
      </div>

      {error && (
        <div style={{ display: "flex", gap: 8, padding: "10px 12px", background: "#fee2e2", borderRadius: 8, marginTop: 14, marginBottom: 4 }}>
          <AlertCircle size={15} color="#dc2626" style={{ flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontSize: 13, color: "#dc2626" }}>{error}</span>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 12 }}>
        <button onClick={onClose} style={{ height: 40, padding: "0 18px", borderRadius: 10, border: "1.5px solid var(--border)", background: "var(--surface)", fontSize: 14, cursor: "pointer", color: "var(--foreground)" }}>Cancel</button>
        <button onClick={save} disabled={!valid || saving} style={{ height: 40, padding: "0 22px", borderRadius: 10, border: "none", background: "var(--primary)", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", opacity: valid && !saving ? 1 : 0.5, display: "flex", alignItems: "center", gap: 7 }}>
          {saving && <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />}
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

function PettyCashTab({ emp, onReload }: { emp: Employee; onReload: () => void }) {
  if (emp.role !== "SUPERVISOR") {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 0", color: "var(--muted-foreground)" }}>
        <Wallet size={32} style={{ marginBottom: 10, opacity: 0.3 }} />
        <p style={{ fontSize: 13 }}>Petty cash is only tracked for Supervisors.</p>
      </div>
    );
  }

  const blank = { amount: 0, date: new Date().toISOString().slice(0, 10), method: "BANK_TRANSFER" as APIDeliveryMethod, reference: "", note: "" };
  const [adding, setAdding] = useState(false);
  const [form, setForm]     = useState(blank);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof typeof blank>(k: K, v: (typeof blank)[K]) => setForm(f => ({ ...f, [k]: v }));

  const total = emp.pettyCash.reduce((s, e) => s + e.amount, 0);

  async function add() {
    if (!form.amount || !form.date || !form.reference.trim()) return;
    setSaving(true);
    try {
      await apiFetch(`/api/employees/${emp.id}/petty-cash`, {
        method: "POST",
        body: JSON.stringify({
          amount: form.amount,
          date: form.date,
          method: form.method,
          reference: form.reference.trim(),
          note: form.note.trim() || undefined,
        }),
      });
      setAdding(false); setForm(blank);
      onReload();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Failed to record disbursement.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this disbursement?")) return;
    try {
      await apiFetch(`/api/employees/${emp.id}/petty-cash/${id}`, { method: "DELETE" });
      onReload();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Failed to delete disbursement.");
    }
  }

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
              <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>{entry.date.slice(0, 10)}</span>
            </div>
            <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
              <span style={{ fontWeight: 600, color: "var(--foreground)" }}>{methodLabel(entry.method)}</span>
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
              <select style={selCss} value={form.method} onChange={e => set("method", e.target.value as APIDeliveryMethod)}>
                {API_METHODS.map(m => <option key={m} value={m}>{methodLabel(m)}</option>)}
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
            <button onClick={add} disabled={saving} style={{ height: 36, padding: "0 18px", borderRadius: 8, border: "none", background: "var(--primary)", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: saving ? 0.6 : 1 }}>
              {saving ? "Saving…" : "Record disbursement"}
            </button>
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

function DetailPanel({ emp, onEdit, onDelete, onReload }: {
  emp: Employee;
  onEdit: () => void;
  onDelete: () => void;
  onReload: () => void;
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
              <Badge label={roleLabel(emp.role)} bg={rc.bg} fg={rc.fg} />
              <Badge label={sexLabel(emp.sex)} bg="#f1f5f9" fg="#475569" />
              {emp.station?.name && <Badge label={emp.station.name} bg="#f0fdf4" fg="#15803d" />}
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
        <div className="grid-3" style={{ gap: 10, marginBottom: 20 }}>
          {[
            { label: "Basic salary",  value: fmtCurrency(emp.basicSalary), icon: <Banknote size={13} /> },
            { label: "Station",       value: emp.station?.name || "—",     icon: <MapPin size={13} /> },
            { label: "Petty cash",    value: emp.role === "SUPERVISOR" ? fmtCurrency(emp.pettyCash.reduce((s, e) => s + e.amount, 0)) : "N/A", icon: <Wallet size={13} /> },
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
            <InfoRow label="Sex"               value={sexLabel(emp.sex)} />
            <InfoRow label="Phone"             value={emp.phone} mono />
            <InfoRow label="Email"             value={emp.email || "—"} />
            <InfoRow label="FAN"               value={fmtFAN(emp.fan ?? "") || "—"} mono />

            <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--muted-foreground)", marginBottom: 8, marginTop: 20 }}>Employment</p>
            <InfoRow label="Employee ID"       value={emp.id} mono />
            <InfoRow label="Role"              value={roleLabel(emp.role)} />
            <InfoRow label="Employment date"   value={emp.employmentDate ? emp.employmentDate.slice(0, 10) : "—"} />
            <InfoRow label="Basic salary"      value={fmtCurrency(emp.basicSalary)} />
            <InfoRow label="Bank account"      value={emp.accountNumber || "—"} mono />

            <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--muted-foreground)", marginBottom: 8, marginTop: 20 }}>POS credentials</p>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
              <span style={{ fontSize: 12, color: "var(--muted-foreground)", fontWeight: 500 }}>POS password</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 14, fontFamily: "monospace", color: "var(--foreground)", letterSpacing: showPwd ? "0.04em" : "0.2em" }}>
                  {showPwd ? (emp.posPassword || "—") : (emp.posPassword ? "••••••••" : "—")}
                </span>
                {emp.posPassword && (
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
            {emp.station ? (
              <div style={{ display: "flex", gap: 14, alignItems: "center", padding: "14px 16px", borderRadius: 12, border: "1px solid var(--border)", background: "var(--background)", marginBottom: 20 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: "#dbeafe", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <MapPin size={18} color="#1d4ed8" />
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "var(--foreground)" }}>{emp.station.name}</div>
                  <div style={{ fontSize: 12, color: "var(--muted-foreground)", fontFamily: "monospace" }}>{emp.station.code}</div>
                </div>
              </div>
            ) : (
              <p style={{ fontSize: 13, color: "var(--muted-foreground)", marginBottom: 20 }}>No station assigned.</p>
            )}

            <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--muted-foreground)", marginBottom: 12 }}>POS machine{emp.posMachines.length > 1 ? "s" : ""}</p>
            {emp.posMachines.length > 0 ? emp.posMachines.map(pos => (
              <div key={pos.id} style={{ display: "flex", gap: 14, alignItems: "center", padding: "14px 16px", borderRadius: 12, border: "1px solid var(--border)", background: "var(--background)", marginBottom: 8 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: "#f0fdf4", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Monitor size={18} color="#16a34a" />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "var(--foreground)", fontFamily: "monospace" }}>{pos.serial}</div>
                  <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>{pos.code}</div>
                </div>
                <span style={{ display: "inline-flex", alignItems: "center", padding: "2px 10px", borderRadius: 999, fontSize: 11, fontWeight: 600, background: "#dcfce7", color: "#16a34a" }}>Assigned</span>
              </div>
            )) : (
              <p style={{ fontSize: 13, color: "var(--muted-foreground)" }}>No POS machine assigned. Edit the employee to assign one.</p>
            )}
          </div>
        )}

        {/* ── Petty Cash ── */}
        {tab === "pettycash" && (
          <PettyCashTab emp={emp} onReload={onReload} />
        )}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selected, setSelected]   = useState<string | null>(null);
  const [activeDetail, setActiveDetail] = useState<Employee | null>(null);
  const [stations, setStations]   = useState<StationOption[]>([]);
  const [posMachines, setPosMachines] = useState<PosOption[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState("");
  const [filterRole, setFilterRole] = useState<APIRole | "All">("All");
  const [filterStation, setFilterStation] = useState<string>("All");
  const [modal, setModal]         = useState<"create" | "edit" | "delete" | null>(null);
  const [toast, setToast]         = useState<string | null>(null);

  const loadEmployees = useCallback(async () => {
    try {
      const res = await apiFetch<{ data: Employee[] }>("/api/employees");
      setEmployees(res.data);
    } catch (e) { console.error(e); }
  }, []);

  const loadStations = useCallback(async () => {
    try {
      const res = await apiFetch<{ data: StationOption[] }>("/api/stations?limit=1000");
      setStations(res.data);
    } catch (e) { console.error(e); }
  }, []);

  const loadPosMachines = useCallback(async () => {
    try {
      const res = await apiFetch<{ data: PosOption[] }>("/api/pos-machines?limit=1000");
      setPosMachines(res.data);
    } catch (e) { console.error(e); }
  }, []);

  const loadActiveDetail = useCallback(async (id: string) => {
    try {
      const res = await apiFetch<Employee>(`/api/employees/${id}`);
      setActiveDetail(res);
    } catch (e) {
      setActiveDetail(null);
      console.error(e);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([loadEmployees(), loadStations(), loadPosMachines()]).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [loadEmployees, loadStations, loadPosMachines]);

  useEffect(() => {
    if (selected) loadActiveDetail(selected);
    else setActiveDetail(null);
  }, [selected, loadActiveDetail]);

  const filtered = useMemo(() => employees.filter(e => {
    const term = search.toLowerCase();
    const nameMatch = e.fullName.toLowerCase().includes(term) || e.phone.includes(term) || e.code.toLowerCase().includes(term);
    const roleMatch = filterRole === "All" || e.role === filterRole;
    const stationMatch = filterStation === "All" || e.stationId === filterStation;
    return nameMatch && roleMatch && stationMatch;
  }), [employees, search, filterRole, filterStation]);

  async function handleSaved() {
    await loadEmployees();
    if (selected) await loadActiveDetail(selected);
    setToast(modal === "create" ? "Employee created" : "Employee updated");
    setModal(null);
  }

  async function handleDelete() {
    if (!activeDetail) return;
    try {
      await apiFetch(`/api/employees/${activeDetail.id}`, { method: "DELETE" });
      await loadEmployees();
      setSelected(null);
      setActiveDetail(null);
      setToast("Employee removed");
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Delete failed");
    }
    setModal(null);
  }

  const active = activeDetail;

  return (
    <>
      <style>{`
        @keyframes fadeUp { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
        @keyframes spin { to { transform: rotate(360deg); } }
        * { box-sizing:border-box; }
        input[type=number]::-webkit-inner-spin-button { -webkit-appearance:none; }
      `}</style>

      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
      {modal === "create" && <EmployeeFormModal stations={stations} posMachines={posMachines} onSaved={handleSaved} onClose={() => setModal(null)} />}
      {modal === "edit"   && active && <EmployeeFormModal initial={active} stations={stations} posMachines={posMachines} onSaved={handleSaved} onClose={() => setModal(null)} />}
      {modal === "delete" && active && <DeleteModal name={active.fullName} onConfirm={handleDelete} onClose={() => setModal(null)} />}

      <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "var(--background)", overflow: "hidden" }}>

        {/* Top bar */}
        <div style={{ padding: "24px 28px 0", flexShrink: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div>
              <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--foreground)", margin: 0 }}>Employees</h1>
              <p style={{ fontSize: 13, color: "var(--muted-foreground)", margin: "3px 0 0" }}>
                {loading ? "Loading…" : `${employees.length} employee${employees.length !== 1 ? "s" : ""} across ${stations.length} stations`}
              </p>
            </div>
            <button onClick={() => setModal("create")} style={{ height: 40, padding: "0 18px", borderRadius: 10, border: "none", background: "var(--primary)", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 7 }}>
              <Plus size={16} strokeWidth={2.5} /> New employee
            </button>
          </div>

          {/* Total stat cards */}
          <div className="grid-4" style={{ gap: 12, marginBottom: 18 }}>
            {[
              { label: "Total employees", value: employees.length, icon: <Users size={16} />, color: "#2563eb", bg: "#dbeafe" },
              { label: "Supervisors", value: employees.filter(e => e.role === "SUPERVISOR").length, icon: <Shield size={16} />, color: "#7c3aed", bg: "#ede9fe" },
              { label: "Ticketers", value: employees.filter(e => e.role === "TICKETER").length, icon: <User size={16} />, color: "#16a34a", bg: "#dcfce7" },
              { label: "Cashiers", value: employees.filter(e => e.role === "CASHIER").length, icon: <CreditCard size={16} />, color: "#d97706", bg: "#fef3c7" },
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
        </div>

        {/* Split pane */}
        <div className="split-panel" style={{ ["--split-left" as string]: "340px", flex: 1, overflow: "hidden" } as React.CSSProperties}>

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
                <select style={{ ...selCss, height: 34, fontSize: 12 }} value={filterRole} onChange={e => setFilterRole(e.target.value as APIRole | "All")}>
                  <option value="All">All roles</option>
                  {API_ROLES.map(r => <option key={r} value={r}>{roleLabel(r)}</option>)}
                </select>
                <select style={{ ...selCss, height: 34, fontSize: 12 }} value={filterStation} onChange={e => setFilterStation(e.target.value)}>
                  <option value="All">All stations</option>
                  {stations.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            </div>

            {/* Employee list */}
            <div style={{ flex: 1, overflowY: "auto" }}>
              {loading && filtered.length === 0 && (
                <div style={{ padding: 40, textAlign: "center", color: "var(--muted-foreground)", fontSize: 13 }}>Loading employees…</div>
              )}
              {!loading && filtered.length === 0 && (
                <div style={{ padding: 24, textAlign: "center", color: "var(--muted-foreground)", fontSize: 13 }}>No employees match your filters.</div>
              )}
              {filtered.map((emp, i) => {
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
                    {/* Row number */}
                    <span style={{ width: 18, flexShrink: 0, textAlign: "right", marginRight: 8, fontSize: 11, color: "var(--muted-foreground)", fontFamily: "monospace" }}>{i + 1}</span>
                    {/* Avatar */}
                    <div style={{ width: 38, height: 38, borderRadius: 11, background: rc.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginRight: 11 }}>
                      <span style={{ fontSize: 13, fontWeight: 800, color: rc.fg }}>{initials(emp)}</span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: isActive ? "var(--primary)" : "var(--foreground)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {emp.firstName} {emp.lastName}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 1 }}>
                        {roleLabel(emp.role)} · {emp.station?.name || "No station"}
                      </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3, flexShrink: 0, marginLeft: 6 }}>
                      <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>{emp.posMachines.length > 0 ? "POS ✓" : "No POS"}</span>
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
                  onReload={() => selected && loadActiveDetail(selected)}
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