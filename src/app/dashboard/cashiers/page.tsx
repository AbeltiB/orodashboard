"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Wallet, Plus, KeyRound, X, Check, Loader2, AlertCircle,
  Building2, Users, ShieldAlert, ShieldCheck, Trash2,
} from "lucide-react";

type Assignment = { id: string; isActive: boolean; assignedAt: string; terminal: { id: string; name: string } };
type CashierRow = {
  id: string;
  code: string;
  name: string;
  phone: string;
  role: string;
  hasPinSet: boolean;
  pinLockedUntil: string | null;
  assignments: Assignment[];
};
type EmployeeOption = { id: string; fullName: string; phone: string; role: string };
type TerminalOption = { id: string; name: string };

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { headers: { "Content-Type": "application/json" }, ...init });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.message ?? json?.error ?? `Request failed: ${res.status}`);
  return json as T;
}

const iCss: React.CSSProperties = {
  height: 40, padding: "0 12px", border: "1.5px solid var(--border)", borderRadius: 9,
  background: "var(--surface)", color: "var(--foreground)", fontSize: 14, outline: "none", width: "100%",
};

function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useState(() => { const t = setTimeout(onDone, 3000); return () => clearTimeout(t); });
  return (
    <div style={{ position: "fixed", bottom: 28, right: 28, zIndex: 9999, background: "#0f172a", color: "#fff", padding: "12px 20px", borderRadius: 12, fontSize: 14, fontWeight: 500, display: "flex", alignItems: "center", gap: 8, boxShadow: "0 8px 30px rgb(0 0 0 / 0.18)", maxWidth: 420 }}>
      <Check size={15} strokeWidth={2.5} color="#4ade80" style={{ flexShrink: 0 }} />{message}
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgb(0 0 0 / 0.35)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: "var(--surface)", borderRadius: 18, width: "100%", maxWidth: 460, boxShadow: "0 24px 60px rgb(0 0 0 / 0.18)", border: "1px solid var(--border)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 24px 0" }}>
          <span style={{ fontSize: 17, fontWeight: 700, color: "var(--foreground)" }}>{title}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", padding: 4 }}><X size={18} /></button>
        </div>
        <div style={{ padding: "20px 24px 24px" }}>{children}</div>
      </div>
    </div>
  );
}

function AssignModal({ employees, terminals, onSaved, onClose }: {
  employees: EmployeeOption[]; terminals: TerminalOption[]; onSaved: () => void; onClose: () => void;
}) {
  const [employeeId, setEmployeeId] = useState("");
  const [terminalId, setTerminalId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!employeeId || !terminalId || saving) return;
    setSaving(true); setError(null);
    try {
      await apiFetch("/api/cashiers/assignments", { method: "POST", body: JSON.stringify({ employeeId, terminalId }) });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to assign.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Assign a cashier" onClose={onClose}>
      <p style={{ fontSize: 13, color: "var(--muted-foreground)", marginBottom: 16, lineHeight: 1.55 }}>
        Pick any existing employee — a new person can be added on the Employees page first, then assigned here.
      </p>
      <div style={{ marginBottom: 14 }}>
        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--muted-foreground)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Employee</label>
        <select style={{ ...iCss, cursor: "pointer" }} value={employeeId} onChange={e => setEmployeeId(e.target.value)}>
          <option value="">Select employee…</option>
          {employees.map(e => <option key={e.id} value={e.id}>{e.fullName} — {e.phone}</option>)}
        </select>
      </div>
      <div style={{ marginBottom: 18 }}>
        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--muted-foreground)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Terminal</label>
        <select style={{ ...iCss, cursor: "pointer" }} value={terminalId} onChange={e => setTerminalId(e.target.value)}>
          <option value="">Select terminal…</option>
          {terminals.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>

      {error && (
        <div style={{ display: "flex", gap: 8, padding: "10px 12px", background: "var(--danger-bg)", borderRadius: 8, marginBottom: 14 }}>
          <AlertCircle size={15} color="var(--danger)" style={{ flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontSize: 13, color: "var(--danger)" }}>{error}</span>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <button onClick={onClose} style={{ height: 40, padding: "0 18px", borderRadius: 10, border: "1.5px solid var(--border)", background: "var(--surface)", fontSize: 14, cursor: "pointer", color: "var(--foreground)" }}>Cancel</button>
        <button onClick={save} disabled={!employeeId || !terminalId || saving} style={{ height: 40, padding: "0 22px", borderRadius: 10, border: "none", background: "var(--primary)", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", opacity: employeeId && terminalId && !saving ? 1 : 0.5, display: "flex", alignItems: "center", gap: 7 }}>
          {saving && <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />}
          Assign
        </button>
      </div>
    </Modal>
  );
}

function PinModal({ cashier, onSaved, onClose }: { cashier: CashierRow; onSaved: (msg: string) => void; onClose: () => void }) {
  const [pin, setPin] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function randomize() {
    setPin(String(Math.floor(1000 + Math.random() * 9000)));
  }

  async function save() {
    if (pin.length !== 4 || saving) return;
    setSaving(true); setError(null);
    try {
      await apiFetch(`/api/cashiers/${cashier.id}/pin`, { method: "POST", body: JSON.stringify({ pin }) });
      onSaved(`PIN set for ${cashier.name}: ${pin} — share it with them directly.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to set PIN.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`${cashier.hasPinSet ? "Reset" : "Set"} PIN — ${cashier.name}`} onClose={onClose}>
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <input
          value={pin}
          onChange={e => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
          style={{ ...iCss, letterSpacing: "0.4em", fontFamily: "monospace", flex: 1 }}
          placeholder="••••"
          inputMode="numeric"
        />
        <button onClick={randomize} style={{ height: 40, padding: "0 14px", borderRadius: 9, border: "1.5px solid var(--border)", background: "var(--surface)", fontSize: 13, fontWeight: 600, cursor: "pointer", color: "var(--foreground)", whiteSpace: "nowrap" }}>
          Random
        </button>
      </div>
      <p style={{ fontSize: 12, color: "var(--muted-foreground)", marginBottom: 16 }}>
        This will also sign the cashier out everywhere so the old PIN stops working.
      </p>

      {error && (
        <div style={{ display: "flex", gap: 8, padding: "10px 12px", background: "var(--danger-bg)", borderRadius: 8, marginBottom: 14 }}>
          <AlertCircle size={15} color="var(--danger)" style={{ flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontSize: 13, color: "var(--danger)" }}>{error}</span>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <button onClick={onClose} style={{ height: 40, padding: "0 18px", borderRadius: 10, border: "1.5px solid var(--border)", background: "var(--surface)", fontSize: 14, cursor: "pointer", color: "var(--foreground)" }}>Cancel</button>
        <button onClick={save} disabled={pin.length !== 4 || saving} style={{ height: 40, padding: "0 22px", borderRadius: 10, border: "none", background: "var(--primary)", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", opacity: pin.length === 4 && !saving ? 1 : 0.5, display: "flex", alignItems: "center", gap: 7 }}>
          {saving && <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />}
          Save
        </button>
      </div>
    </Modal>
  );
}

export default function CashiersPage() {
  const [cashiers, setCashiers] = useState<CashierRow[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [terminals, setTerminals] = useState<TerminalOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAssign, setShowAssign] = useState(false);
  const [pinTarget, setPinTarget] = useState<CashierRow | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch<{ data: CashierRow[] }>("/api/cashiers");
      setCashiers(res.data);
    } catch (e) { console.error(e); }
  }, []);

  const loadOptions = useCallback(async () => {
    try {
      const [empRes, termRes] = await Promise.all([
        apiFetch<{ data: { id: string; fullName: string; phone: string; role: string }[] }>("/api/employees?limit=1000"),
        apiFetch<{ data: TerminalOption[] }>("/api/terminals?isDeparture=true&limit=1000"),
      ]);
      setEmployees(empRes.data.map(e => ({ id: e.id, fullName: e.fullName, phone: e.phone, role: e.role })));
      setTerminals(termRes.data);
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([load(), loadOptions()]).finally(() => setLoading(false));
  }, [load, loadOptions]);

  async function removeAssignment(assignmentId: string) {
    if (!confirm("Remove this terminal assignment?")) return;
    try {
      await apiFetch(`/api/cashiers/assignments/${assignmentId}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Failed to remove assignment.");
    }
  }

  const stats = useMemo(() => ({
    total: cashiers.length,
    terminals: new Set(cashiers.flatMap(c => c.assignments.filter(a => a.isActive).map(a => a.terminal.id))).size,
    noPin: cashiers.filter(c => !c.hasPinSet).length,
    locked: cashiers.filter(c => c.pinLockedUntil && new Date(c.pinLockedUntil) > new Date()).length,
  }), [cashiers]);

  return (
    <>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } } * { box-sizing: border-box; }`}</style>
      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
      {showAssign && <AssignModal employees={employees} terminals={terminals} onSaved={() => { setShowAssign(false); load(); setToast("Cashier assigned."); }} onClose={() => setShowAssign(false)} />}
      {pinTarget && <PinModal cashier={pinTarget} onSaved={(msg) => { setPinTarget(null); load(); setToast(msg); }} onClose={() => setPinTarget(null)} />}

      <div className="page-pad" style={{ minHeight: "100vh", background: "var(--background)", padding: "24px 28px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--foreground)", margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
              <Wallet size={22} /> Cashiers
            </h1>
            <p style={{ fontSize: 13, color: "var(--muted-foreground)", margin: "3px 0 0" }}>
              Who deposits each terminal&apos;s daily cash, and their PIN sign-in status.
            </p>
          </div>
          <button onClick={() => setShowAssign(true)} style={{ height: 40, padding: "0 18px", borderRadius: 10, border: "none", background: "var(--primary)", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 7 }}>
            <Plus size={16} strokeWidth={2.5} /> Assign cashier
          </button>
        </div>

        <div className="grid-4" style={{ gap: 12, marginBottom: 18 }}>
          {[
            { label: "Cashiers", value: stats.total, icon: <Users size={16} />, color: "#2563eb", bg: "#dbeafe" },
            { label: "Terminals covered", value: stats.terminals, icon: <Building2 size={16} />, color: "#16a34a", bg: "#dcfce7" },
            { label: "PIN not set", value: stats.noPin, icon: <ShieldAlert size={16} />, color: "#d97706", bg: "#fef3c7" },
            { label: "Currently locked", value: stats.locked, icon: <ShieldCheck size={16} />, color: "#dc2626", bg: "#fee2e2" },
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

        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--muted-foreground)", fontSize: 13 }}>Loading…</div>
        ) : cashiers.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "60px 0", color: "var(--muted-foreground)" }}>
            <Wallet size={36} style={{ marginBottom: 12, opacity: 0.25 }} />
            <p style={{ fontSize: 14 }}>No cashiers assigned yet.</p>
          </div>
        ) : (
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "var(--background)", borderBottom: "1px solid var(--border)" }}>
                    {["#", "Name", "Phone", "Terminals", "PIN status", ""].map(h => (
                      <th key={h} style={{ textAlign: "left", padding: "10px 14px", fontSize: 11, fontWeight: 700, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cashiers.map((c, i) => {
                    const locked = c.pinLockedUntil && new Date(c.pinLockedUntil) > new Date();
                    return (
                      <tr key={c.id} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "10px 14px", color: "var(--muted-foreground)", fontFamily: "monospace", fontSize: 12 }}>{i + 1}</td>
                        <td style={{ padding: "10px 14px", fontWeight: 600, color: "var(--foreground)", whiteSpace: "nowrap" }}>{c.name}</td>
                        <td style={{ padding: "10px 14px", color: "var(--muted-foreground)", fontFamily: "monospace" }}>{c.phone}</td>
                        <td style={{ padding: "10px 14px" }}>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                            {c.assignments.filter(a => a.isActive).map(a => (
                              <span key={a.id} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 600, background: "#dcfce7", color: "#16a34a", padding: "3px 8px 3px 10px", borderRadius: 999 }}>
                                {a.terminal.name}
                                <button onClick={() => removeAssignment(a.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#16a34a", display: "flex", padding: 0 }}>
                                  <Trash2 size={11} />
                                </button>
                              </span>
                            ))}
                            {c.assignments.filter(a => a.isActive).length === 0 && <span style={{ color: "var(--muted-foreground)", fontSize: 12 }}>None active</span>}
                          </div>
                        </td>
                        <td style={{ padding: "10px 14px" }}>
                          <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: locked ? "#fee2e2" : c.hasPinSet ? "#dcfce7" : "#f1f5f9", color: locked ? "#dc2626" : c.hasPinSet ? "#16a34a" : "#64748b" }}>
                            {locked ? "Locked" : c.hasPinSet ? "PIN set" : "No PIN"}
                          </span>
                        </td>
                        <td style={{ padding: "10px 14px", textAlign: "right" }}>
                          <button onClick={() => setPinTarget(c)} style={{ height: 32, padding: "0 12px", borderRadius: 8, border: "1.5px solid var(--border)", background: "var(--surface)", fontSize: 12, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, color: "var(--foreground)", fontWeight: 500 }}>
                            <KeyRound size={12} /> {c.hasPinSet ? "Reset PIN" : "Set PIN"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
