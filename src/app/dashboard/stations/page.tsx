"use client";

import { useState, useRef, useEffect } from "react";
import {
  MapPin, Plus, Pencil, Trash2, X, Check, ChevronRight,
  Users, Monitor, Navigation, Building2, Search, AlertCircle,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type TerminalRef = { id: string; isStation: boolean; name: string; isDeparture: boolean; isArrival: boolean };
type Employee    = { id: string; fullName: string; phone: string; email: string; isWorking: boolean; remark: string };
type POS         = { id: string; serial: string; typeName: string; assignedTo: string };

type Station = {
  id: string;
  name: string;
  region: string;
  zone: string;
  location: string;
  terminals: TerminalRef[];
  employees: Employee[];
  posMachines: POS[];
};

// ─── Seed data ────────────────────────────────────────────────────────────────

const SEED: Station[] = [
  {
    id: "STN-001",
    name: "Meskel Square Terminal",
    region: "Addis Ababa",
    zone: "Central",
    location: "Meskel Square, Addis Ababa",
    terminals: [
      { id: "t1", isStation: true,  name: "Bole Station",      isDeparture: true,  isArrival: false },
      { id: "t2", isStation: false, name: "Hayat Stop",         isDeparture: false, isArrival: true  },
    ],
    employees: [
      { id: "e1", fullName: "Abebe Girma",   phone: "0911234567", email: "abebe@adrash.et",  isWorking: true,  remark: "" },
      { id: "e2", fullName: "Tigist Haile",  phone: "0922345678", email: "tigist@adrash.et", isWorking: false, remark: "On leave" },
    ],
    posMachines: [
      { id: "p1", serial: "POS-AA-001", typeName: "Verifone V240m", assignedTo: "Abebe Girma" },
    ],
  },
  {
    id: "STN-002",
    name: "Bole Station",
    region: "Addis Ababa",
    zone: "East",
    location: "Bole Road, Addis Ababa",
    terminals: [],
    employees: [
      { id: "e3", fullName: "Dawit Tesfaye", phone: "0933456789", email: "dawit@adrash.et", isWorking: true, remark: "" },
    ],
    posMachines: [],
  },
  {
    id: "STN-003",
    name: "Piassa Hub",
    region: "Addis Ababa",
    zone: "North",
    location: "Piassa, Addis Ababa",
    terminals: [],
    employees: [],
    posMachines: [],
  },
];

const REGIONS = ["Addis Ababa", "Oromia", "Amhara", "Tigray", "SNNPR", "Afar", "Somali", "Benishangul-Gumuz", "Gambela", "Harari", "Dire Dawa", "Sidama"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uid() { return Math.random().toString(36).slice(2, 9); }

function Badge({ label, color }: { label: string; color: "blue" | "green" | "slate" | "amber" }) {
  const map = {
    blue:  { bg: "#dbeafe", fg: "#1d4ed8" },
    green: { bg: "#dcfce7", fg: "#16a34a" },
    slate: { bg: "#f1f5f9", fg: "#475569" },
    amber: { bg: "#fef3c7", fg: "#d97706" },
  };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      padding: "2px 8px", borderRadius: 999,
      fontSize: 11, fontWeight: 600,
      background: map[color].bg, color: map[color].fg,
    }}>{label}</span>
  );
}

function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => { const t = setTimeout(onDone, 2400); return () => clearTimeout(t); }, [onDone]);
  return (
    <div style={{
      position: "fixed", bottom: 28, right: 28, zIndex: 9999,
      background: "#0f172a", color: "#fff",
      padding: "12px 20px", borderRadius: 12,
      fontSize: 14, fontWeight: 500,
      display: "flex", alignItems: "center", gap: 8,
      boxShadow: "0 8px 30px rgb(0 0 0 / 0.18)",
      animation: "fadeUp 0.22s ease",
    }}>
      <Check size={15} strokeWidth={2.5} color="#4ade80" />
      {message}
    </div>
  );
}

// ─── Modal shell ──────────────────────────────────────────────────────────────

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "rgb(0 0 0 / 0.35)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 16,
    }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: "var(--surface)", borderRadius: 18, width: "100%", maxWidth: 540,
        boxShadow: "0 24px 60px rgb(0 0 0 / 0.18)",
        border: "1px solid var(--border)",
        maxHeight: "90vh", display: "flex", flexDirection: "column",
      }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 24px 0" }}>
          <span style={{ fontSize: 17, fontWeight: 700, color: "var(--foreground)" }}>{title}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", padding: 4 }}>
            <X size={18} />
          </button>
        </div>
        {/* Body */}
        <div style={{ padding: "20px 24px 24px", overflowY: "auto" }}>{children}</div>
      </div>
    </div>
  );
}

// ─── Form field ───────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--foreground)", marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  );
}

const inputCss: React.CSSProperties = {
  width: "100%", height: 42, padding: "0 12px",
  border: "1.5px solid var(--border)", borderRadius: 10,
  background: "var(--surface)", color: "var(--foreground)",
  fontSize: 14, outline: "none",
};

const selectCss: React.CSSProperties = { ...inputCss, cursor: "pointer" };

// ─── Station form modal ───────────────────────────────────────────────────────

function StationFormModal({
  initial, onSave, onClose,
}: {
  initial?: Station; onSave: (s: Station) => void; onClose: () => void;
}) {
  const blank: Station = { id: "", name: "", region: "", zone: "", location: "", terminals: [], employees: [], posMachines: [] };
  const [form, setForm] = useState<Station>(initial ?? blank);
  const set = (k: keyof Station, v: unknown) => setForm(f => ({ ...f, [k]: v }));

  function save() {
    if (!form.name.trim() || !form.region || !form.zone.trim() || !form.location.trim()) return;
    onSave({ ...form, id: form.id || `STN-${String(Date.now()).slice(-4)}` });
  }

  return (
    <Modal title={initial ? "Edit station" : "New station"} onClose={onClose}>
      <Field label="Station name *">
        <input style={inputCss} value={form.name} onChange={e => set("name", e.target.value)} placeholder="e.g. Meskel Square Terminal" />
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Region *">
          <select style={selectCss} value={form.region} onChange={e => set("region", e.target.value)}>
            <option value="">Select…</option>
            {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </Field>
        <Field label="Zone *">
          <input style={inputCss} value={form.zone} onChange={e => set("zone", e.target.value)} placeholder="e.g. Central" />
        </Field>
      </div>
      <Field label="Location / address *">
        <input style={inputCss} value={form.location} onChange={e => set("location", e.target.value)} placeholder="Street or landmark" />
      </Field>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
        <button onClick={onClose} style={{ height: 40, padding: "0 18px", borderRadius: 10, border: "1.5px solid var(--border)", background: "var(--surface)", fontSize: 14, cursor: "pointer", color: "var(--foreground)" }}>
          Cancel
        </button>
        <button
          onClick={save}
          disabled={!form.name.trim() || !form.region || !form.zone.trim() || !form.location.trim()}
          style={{ height: 40, padding: "0 22px", borderRadius: 10, border: "none", background: "var(--primary)", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", opacity: (!form.name || !form.region || !form.zone || !form.location) ? 0.5 : 1 }}
        >
          {initial ? "Save changes" : "Create station"}
        </button>
      </div>
    </Modal>
  );
}

// ─── Delete confirm modal ─────────────────────────────────────────────────────

function DeleteModal({ name, onConfirm, onClose }: { name: string; onConfirm: () => void; onClose: () => void }) {
  return (
    <Modal title="Delete station" onClose={onClose}>
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start", marginBottom: 24 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: "#fee2e2", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <AlertCircle size={20} color="#dc2626" />
        </div>
        <p style={{ fontSize: 14, color: "var(--muted-foreground)", lineHeight: 1.6, margin: 0 }}>
          Permanently delete <strong style={{ color: "var(--foreground)" }}>{name}</strong>? This removes all associated terminals, employees, and POS assignments. This cannot be undone.
        </p>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <button onClick={onClose} style={{ height: 40, padding: "0 18px", borderRadius: 10, border: "1.5px solid var(--border)", background: "var(--surface)", fontSize: 14, cursor: "pointer", color: "var(--foreground)" }}>
          Cancel
        </button>
        <button onClick={onConfirm} style={{ height: 40, padding: "0 22px", borderRadius: 10, border: "none", background: "#dc2626", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
          Delete station
        </button>
      </div>
    </Modal>
  );
}

// ─── Terminals tab ────────────────────────────────────────────────────────────

function TerminalsTab({ station, allStations, onChange }: { station: Station; allStations: Station[]; onChange: (t: TerminalRef[]) => void }) {
  const blank: Omit<TerminalRef, "id"> = { isStation: false, name: "", isDeparture: false, isArrival: true };
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(blank);
  const [query, setQuery] = useState("");

  const suggestions = allStations.filter(s => s.id !== station.id && s.name.toLowerCase().includes(query.toLowerCase()) && query.length > 0);

  function add() {
    if (!form.name.trim()) return;
    onChange([...station.terminals, { ...form, id: uid() }]);
    setAdding(false); setForm(blank); setQuery("");
  }

  function remove(id: string) { onChange(station.terminals.filter(t => t.id !== id)); }

  function toggle(id: string, key: "isDeparture" | "isArrival") {
    onChange(station.terminals.map(t => t.id === id ? { ...t, [key]: !t[key] } : t));
  }

  return (
    <div>
      {station.terminals.length === 0 && !adding && (
        <p style={{ fontSize: 13, color: "var(--muted-foreground)", marginBottom: 16 }}>No terminals added yet.</p>
      )}

      {station.terminals.map(t => (
        <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 10, border: "1px solid var(--border)", marginBottom: 8, background: "var(--background)" }}>
          <Navigation size={14} color="var(--muted-foreground)" style={{ flexShrink: 0 }} />
          <span style={{ flex: 1, fontSize: 14, fontWeight: 500, color: "var(--foreground)" }}>{t.name}</span>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {t.isStation && <Badge label="Station" color="blue" />}
            <button onClick={() => toggle(t.id, "isDeparture")} style={{ border: "none", cursor: "pointer", borderRadius: 999, padding: "2px 8px", fontSize: 11, fontWeight: 600, background: t.isDeparture ? "#dcfce7" : "#f1f5f9", color: t.isDeparture ? "#16a34a" : "#94a3b8" }}>Departure</button>
            <button onClick={() => toggle(t.id, "isArrival")} style={{ border: "none", cursor: "pointer", borderRadius: 999, padding: "2px 8px", fontSize: 11, fontWeight: 600, background: t.isArrival ? "#dbeafe" : "#f1f5f9", color: t.isArrival ? "#1d4ed8" : "#94a3b8" }}>Arrival</button>
          </div>
          <button onClick={() => remove(t.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#dc2626", padding: 4, display: "flex" }}>
            <Trash2 size={14} />
          </button>
        </div>
      ))}

      {adding ? (
        <div style={{ border: "1.5px solid var(--primary)", borderRadius: 12, padding: 16, marginBottom: 8, background: "var(--surface)" }}>
          <Field label="Terminal name">
            <div style={{ position: "relative" }}>
              <input
                style={inputCss}
                placeholder="Type name or search existing station…"
                value={query || form.name}
                onChange={e => { setQuery(e.target.value); setForm(f => ({ ...f, name: e.target.value, isStation: false })); }}
                autoFocus
              />
              {suggestions.length > 0 && (
                <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, zIndex: 50, boxShadow: "0 8px 24px rgb(0 0 0 / 0.1)" }}>
                  {suggestions.map(s => (
                    <button key={s.id} onClick={() => { setForm(f => ({ ...f, name: s.name, isStation: true })); setQuery(""); }}
                      style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 14px", border: "none", background: "none", cursor: "pointer", fontSize: 14, color: "var(--foreground)", borderBottom: "1px solid var(--border)" }}>
                      <Building2 size={13} style={{ marginRight: 8, verticalAlign: "middle", color: "var(--primary)" }} />
                      {s.name}
                      <span style={{ fontSize: 11, color: "var(--muted-foreground)", marginLeft: 8 }}>{s.region}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </Field>
          <div style={{ display: "flex", gap: 16, marginBottom: 14 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
              <input type="checkbox" checked={form.isDeparture} onChange={e => setForm(f => ({ ...f, isDeparture: e.target.checked }))} />
              Departure terminal
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
              <input type="checkbox" checked={form.isArrival} onChange={e => setForm(f => ({ ...f, isArrival: e.target.checked }))} />
              Arrival terminal
            </label>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={add} style={{ height: 36, padding: "0 18px", borderRadius: 8, border: "none", background: "var(--primary)", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Add terminal</button>
            <button onClick={() => { setAdding(false); setForm(blank); setQuery(""); }} style={{ height: 36, padding: "0 14px", borderRadius: 8, border: "1.5px solid var(--border)", background: "var(--surface)", fontSize: 13, cursor: "pointer", color: "var(--foreground)" }}>Cancel</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} style={{ display: "flex", alignItems: "center", gap: 6, height: 36, padding: "0 14px", borderRadius: 8, border: "1.5px dashed var(--border)", background: "none", fontSize: 13, color: "var(--primary)", cursor: "pointer", fontWeight: 500 }}>
          <Plus size={15} /> Add terminal
        </button>
      )}
    </div>
  );
}

// ─── Employees tab ────────────────────────────────────────────────────────────

function EmployeesTab({ station, onChange }: { station: Station; onChange: (e: Employee[]) => void }) {
  const blank: Omit<Employee, "id"> = { fullName: "", phone: "", email: "", isWorking: true, remark: "" };
  const [editId, setEditId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(blank);

  function startEdit(emp: Employee) { setEditId(emp.id); setForm(emp); setAdding(false); }
  function saveEdit() {
    onChange(station.employees.map(e => e.id === editId ? { ...form, id: editId! } : e));
    setEditId(null);
  }
  function addEmp() {
    if (!form.fullName.trim()) return;
    onChange([...station.employees, { ...form, id: uid() }]);
    setAdding(false); setForm(blank);
  }
  function remove(id: string) { onChange(station.employees.filter(e => e.id !== id)); }

  const EmpForm = ({ onSave, onCancel }: { onSave: () => void; onCancel: () => void }) => (
    <div style={{ border: "1.5px solid var(--primary)", borderRadius: 12, padding: 16, marginBottom: 8, background: "var(--surface)" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
        <Field label="Full name *"><input style={inputCss} value={form.fullName} onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))} autoFocus /></Field>
        <Field label="Phone"><input style={inputCss} value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="09XXXXXXXX" /></Field>
        <Field label="Email"><input style={inputCss} value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="name@company.et" /></Field>
        <Field label="Remark"><input style={inputCss} value={form.remark} onChange={e => setForm(f => ({ ...f, remark: e.target.value }))} /></Field>
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer", marginBottom: 14 }}>
        <input type="checkbox" checked={form.isWorking} onChange={e => setForm(f => ({ ...f, isWorking: e.target.checked }))} />
        Currently working
      </label>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={onSave} style={{ height: 36, padding: "0 18px", borderRadius: 8, border: "none", background: "var(--primary)", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Save</button>
        <button onClick={onCancel} style={{ height: 36, padding: "0 14px", borderRadius: 8, border: "1.5px solid var(--border)", background: "var(--surface)", fontSize: 13, cursor: "pointer", color: "var(--foreground)" }}>Cancel</button>
      </div>
    </div>
  );

  return (
    <div>
      {station.employees.length === 0 && !adding && (
        <p style={{ fontSize: 13, color: "var(--muted-foreground)", marginBottom: 16 }}>No employees assigned yet.</p>
      )}
      {station.employees.map(emp => (
        editId === emp.id
          ? <EmpForm key={emp.id} onSave={saveEdit} onCancel={() => setEditId(null)} />
          : (
            <div key={emp.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 10, border: "1px solid var(--border)", marginBottom: 8, background: "var(--background)" }}>
              <div style={{ width: 34, height: 34, borderRadius: "50%", background: "color-mix(in srgb, var(--primary) 12%, transparent)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--primary)" }}>{emp.fullName.charAt(0)}</span>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--foreground)" }}>{emp.fullName}</div>
                <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>{emp.phone}{emp.email ? ` · ${emp.email}` : ""}</div>
              </div>
              <Badge label={emp.isWorking ? "Working" : "Inactive"} color={emp.isWorking ? "green" : "slate"} />
              <button onClick={() => startEdit(emp)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", padding: 4 }}><Pencil size={14} /></button>
              <button onClick={() => remove(emp.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#dc2626", padding: 4 }}><Trash2 size={14} /></button>
            </div>
          )
      ))}
      {adding
        ? <EmpForm onSave={addEmp} onCancel={() => { setAdding(false); setForm(blank); }} />
        : (
          <button onClick={() => { setAdding(true); setForm(blank); setEditId(null); }} style={{ display: "flex", alignItems: "center", gap: 6, height: 36, padding: "0 14px", borderRadius: 8, border: "1.5px dashed var(--border)", background: "none", fontSize: 13, color: "var(--primary)", cursor: "pointer", fontWeight: 500 }}>
            <Plus size={15} /> Add employee
          </button>
        )
      }
    </div>
  );
}

// ─── POS tab ──────────────────────────────────────────────────────────────────

function POSTab({ station, onChange }: { station: Station; onChange: (p: POS[]) => void }) {
  const blank: Omit<POS, "id"> = { serial: "", typeName: "", assignedTo: "" };
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(blank);

  const empNames = station.employees.map(e => e.fullName);

  function add() {
    if (!form.serial.trim() || !form.typeName.trim()) return;
    onChange([...station.posMachines, { ...form, id: uid() }]);
    setAdding(false); setForm(blank);
  }
  function saveEdit() {
    onChange(station.posMachines.map(p => p.id === editId ? { ...form, id: editId! } : p));
    setEditId(null);
  }
  function remove(id: string) { onChange(station.posMachines.filter(p => p.id !== id)); }

  const POSForm = ({ onSave, onCancel }: { onSave: () => void; onCancel: () => void }) => (
    <div style={{ border: "1.5px solid var(--primary)", borderRadius: 12, padding: 16, marginBottom: 8, background: "var(--surface)" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
        <Field label="Serial number *"><input style={inputCss} value={form.serial} onChange={e => setForm(f => ({ ...f, serial: e.target.value }))} placeholder="POS-AA-XXX" autoFocus /></Field>
        <Field label="Machine type *"><input style={inputCss} value={form.typeName} onChange={e => setForm(f => ({ ...f, typeName: e.target.value }))} placeholder="e.g. Verifone V240m" /></Field>
      </div>
      <Field label="Assigned to">
        <select style={selectCss} value={form.assignedTo} onChange={e => setForm(f => ({ ...f, assignedTo: e.target.value }))}>
          <option value="">Unassigned</option>
          {empNames.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
      </Field>
      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
        <button onClick={onSave} style={{ height: 36, padding: "0 18px", borderRadius: 8, border: "none", background: "var(--primary)", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Save</button>
        <button onClick={onCancel} style={{ height: 36, padding: "0 14px", borderRadius: 8, border: "1.5px solid var(--border)", background: "var(--surface)", fontSize: 13, cursor: "pointer", color: "var(--foreground)" }}>Cancel</button>
      </div>
    </div>
  );

  return (
    <div>
      {station.posMachines.length === 0 && !adding && (
        <p style={{ fontSize: 13, color: "var(--muted-foreground)", marginBottom: 16 }}>No POS machines assigned yet.</p>
      )}
      {station.posMachines.map(pos => (
        editId === pos.id
          ? <POSForm key={pos.id} onSave={saveEdit} onCancel={() => setEditId(null)} />
          : (
            <div key={pos.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 10, border: "1px solid var(--border)", marginBottom: 8, background: "var(--background)" }}>
              <div style={{ width: 34, height: 34, borderRadius: 8, background: "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Monitor size={16} color="var(--primary)" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--foreground)" }}>{pos.serial}</div>
                <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>{pos.typeName}{pos.assignedTo ? ` · ${pos.assignedTo}` : " · Unassigned"}</div>
              </div>
              <Badge label={pos.assignedTo ? "Assigned" : "Unassigned"} color={pos.assignedTo ? "blue" : "amber"} />
              <button onClick={() => { setEditId(pos.id); setForm(pos); setAdding(false); }} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", padding: 4 }}><Pencil size={14} /></button>
              <button onClick={() => remove(pos.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#dc2626", padding: 4 }}><Trash2 size={14} /></button>
            </div>
          )
      ))}
      {adding
        ? <POSForm onSave={add} onCancel={() => { setAdding(false); setForm(blank); }} />
        : (
          <button onClick={() => { setAdding(true); setForm(blank); setEditId(null); }} style={{ display: "flex", alignItems: "center", gap: 6, height: 36, padding: "0 14px", borderRadius: 8, border: "1.5px dashed var(--border)", background: "none", fontSize: 13, color: "var(--primary)", cursor: "pointer", fontWeight: 500 }}>
            <Plus size={15} /> Add POS machine
          </button>
        )
      }
    </div>
  );
}

// ─── Detail panel ─────────────────────────────────────────────────────────────

type Tab = "terminals" | "employees" | "pos";

function DetailPanel({
  station, allStations,
  onEdit, onDelete, onUpdate,
}: {
  station: Station; allStations: Station[];
  onEdit: () => void; onDelete: () => void;
  onUpdate: (s: Station) => void;
}) {
  const [tab, setTab] = useState<Tab>("terminals");

  function tabBtn(id: Tab, label: string, count: number) {
    const active = tab === id;
    return (
      <button onClick={() => setTab(id)} style={{
        height: 36, padding: "0 14px", borderRadius: 8, border: "none",
        background: active ? "color-mix(in srgb, var(--primary) 10%, transparent)" : "none",
        color: active ? "var(--primary)" : "var(--muted-foreground)",
        fontSize: 13, fontWeight: active ? 600 : 400, cursor: "pointer",
        display: "flex", alignItems: "center", gap: 6,
      }}>
        {label}
        <span style={{ background: active ? "var(--primary)" : "var(--border)", color: active ? "#fff" : "var(--muted-foreground)", borderRadius: 999, padding: "1px 7px", fontSize: 11, fontWeight: 600 }}>
          {count}
        </span>
      </button>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header */}
      <div style={{ padding: "28px 28px 0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", color: "var(--primary)", textTransform: "uppercase", marginBottom: 4 }}>
              {station.id}
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--foreground)", margin: 0 }}>{station.name}</h2>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onEdit} style={{ height: 34, padding: "0 14px", borderRadius: 8, border: "1.5px solid var(--border)", background: "var(--surface)", fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 5, color: "var(--foreground)", fontWeight: 500 }}>
              <Pencil size={13} /> Edit
            </button>
            <button onClick={onDelete} style={{ height: 34, padding: "0 14px", borderRadius: 8, border: "1.5px solid #fecaca", background: "#fff5f5", fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 5, color: "#dc2626", fontWeight: 500 }}>
              <Trash2 size={13} /> Delete
            </button>
          </div>
        </div>

        {/* Meta pills */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12, marginBottom: 20 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--muted-foreground)", background: "var(--background)", border: "1px solid var(--border)", borderRadius: 999, padding: "3px 10px" }}>
            <MapPin size={11} /> {station.location}
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--muted-foreground)", background: "var(--background)", border: "1px solid var(--border)", borderRadius: 999, padding: "3px 10px" }}>
            {station.region} · {station.zone}
          </span>
        </div>

        {/* Stats row */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 20 }}>
          {[
            { label: "Terminals",  value: station.terminals.length,  icon: <Navigation size={14} /> },
            { label: "Employees",  value: station.employees.length,   icon: <Users size={14} /> },
            { label: "POS machines", value: station.posMachines.length, icon: <Monitor size={14} /> },
          ].map(s => (
            <div key={s.label} style={{ background: "var(--background)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 14px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 5, color: "var(--muted-foreground)", fontSize: 11, marginBottom: 4 }}>
                {s.icon} {s.label}
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: "var(--foreground)" }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Tab bar */}
        <div style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--border)", paddingBottom: 0, marginBottom: 0 }}>
          {tabBtn("terminals", "Terminals",   station.terminals.length)}
          {tabBtn("employees", "Employees",   station.employees.length)}
          {tabBtn("pos",       "POS Machines", station.posMachines.length)}
        </div>
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 28px 28px" }}>
        {tab === "terminals" && (
          <TerminalsTab
            station={station} allStations={allStations}
            onChange={t => onUpdate({ ...station, terminals: t })}
          />
        )}
        {tab === "employees" && (
          <EmployeesTab
            station={station}
            onChange={e => onUpdate({ ...station, employees: e })}
          />
        )}
        {tab === "pos" && (
          <POSTab
            station={station}
            onChange={p => onUpdate({ ...station, posMachines: p })}
          />
        )}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function StationsPage() {
  const [stations, setStations]   = useState<Station[]>(SEED);
  const [selected, setSelected]   = useState<string | null>(SEED[0].id);
  const [search, setSearch]       = useState("");
  const [modal, setModal]         = useState<"create" | "edit" | "delete" | null>(null);
  const [toast, setToast]         = useState<string | null>(null);

  const filtered = stations.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.region.toLowerCase().includes(search.toLowerCase()) ||
    s.zone.toLowerCase().includes(search.toLowerCase())
  );

  const activeStation = stations.find(s => s.id === selected) ?? null;

  function upsert(s: Station) {
    setStations(prev => {
      const idx = prev.findIndex(x => x.id === s.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = s; return next; }
      return [...prev, s];
    });
    setSelected(s.id);
    setToast(modal === "create" ? `"${s.name}" created` : `"${s.name}" updated`);
    setModal(null);
  }

  function deleteActive() {
    if (!activeStation) return;
    setToast(`"${activeStation.name}" deleted`);
    setStations(prev => prev.filter(s => s.id !== activeStation.id));
    setSelected(stations.find(s => s.id !== activeStation.id)?.id ?? null);
    setModal(null);
  }

  return (
    <>
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        * { box-sizing: border-box; }
      `}</style>

      {toast && <Toast message={toast} onDone={() => setToast(null)} />}

      {modal === "create" && (
        <StationFormModal onSave={upsert} onClose={() => setModal(null)} />
      )}
      {modal === "edit" && activeStation && (
        <StationFormModal initial={activeStation} onSave={upsert} onClose={() => setModal(null)} />
      )}
      {modal === "delete" && activeStation && (
        <DeleteModal name={activeStation.name} onConfirm={deleteActive} onClose={() => setModal(null)} />
      )}

      {/* Page layout */}
      <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "var(--background)", overflow: "hidden" }}>

        {/* Top bar */}
        <div style={{ padding: "24px 28px 0", flexShrink: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <div>
              <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--foreground)", margin: 0 }}>Stations</h1>
              <p style={{ fontSize: 13, color: "var(--muted-foreground)", margin: "3px 0 0" }}>
                {stations.length} station{stations.length !== 1 ? "s" : ""} · Manage locations, terminals, staff and POS
              </p>
            </div>
            <button
              onClick={() => setModal("create")}
              style={{ height: 40, padding: "0 18px", borderRadius: 10, border: "none", background: "var(--primary)", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 7 }}
            >
              <Plus size={16} strokeWidth={2.5} /> New station
            </button>
          </div>
        </div>

        {/* Split pane */}
        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "320px 1fr", overflow: "hidden", gap: 0 }}>

          {/* Left — station list */}
          <div style={{ borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--surface)" }}>
            {/* Search */}
            <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
              <div style={{ position: "relative" }}>
                <Search size={14} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "var(--muted-foreground)" }} />
                <input
                  placeholder="Search stations…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  style={{ ...inputCss, paddingLeft: 32, height: 36, fontSize: 13 }}
                />
              </div>
            </div>

            {/* List */}
            <div style={{ flex: 1, overflowY: "auto" }}>
              {filtered.length === 0 && (
                <div style={{ padding: 24, textAlign: "center", color: "var(--muted-foreground)", fontSize: 13 }}>No stations match "{search}"</div>
              )}
              {filtered.map(s => {
                const active = s.id === selected;
                return (
                  <button
                    key={s.id}
                    onClick={() => setSelected(s.id)}
                    style={{
                      display: "flex", alignItems: "center", width: "100%", textAlign: "left",
                      padding: "14px 16px", border: "none", cursor: "pointer",
                      borderBottom: "1px solid var(--border)",
                      background: active ? "color-mix(in srgb, var(--primary) 7%, transparent)" : "transparent",
                      borderLeft: `3px solid ${active ? "var(--primary)" : "transparent"}`,
                      transition: "background 0.12s ease",
                    }}
                  >
                    <div style={{ width: 36, height: 36, borderRadius: 9, background: active ? "color-mix(in srgb, var(--primary) 15%, transparent)" : "var(--background)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginRight: 12 }}>
                      <MapPin size={15} color={active ? "var(--primary)" : "var(--muted-foreground)"} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: active ? "var(--primary)" : "var(--foreground)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}</div>
                      <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 1 }}>{s.region} · {s.zone}</div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3, flexShrink: 0 }}>
                      <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>{s.employees.length} staff</span>
                      <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>{s.terminals.length} terminals</span>
                    </div>
                    <ChevronRight size={14} color="var(--muted-foreground)" style={{ marginLeft: 8, flexShrink: 0 }} />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right — detail panel */}
          <div style={{ overflowY: "auto", background: "var(--surface)" }}>
            {activeStation
              ? (
                <DetailPanel
                  station={activeStation}
                  allStations={stations}
                  onEdit={() => setModal("edit")}
                  onDelete={() => setModal("delete")}
                  onUpdate={updated => setStations(prev => prev.map(s => s.id === updated.id ? updated : s))}
                />
              )
              : (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--muted-foreground)" }}>
                  <Building2 size={40} style={{ marginBottom: 12, opacity: 0.3 }} />
                  <p style={{ fontSize: 14 }}>Select a station to view details</p>
                </div>
              )
            }
          </div>
        </div>
      </div>
    </>
  );
}