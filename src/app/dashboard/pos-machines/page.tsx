"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Monitor, Plus, Pencil, Trash2, X, Check, Search,
  AlertCircle, MapPin, User, ChevronRight, Clock,
  History, ArrowRightLeft, Play, Square, Repeat,
} from "lucide-react";

// ─── Types matching the POS API ───────────────────────────────────────────────

type APIStatus = "ACTIVE" | "IDLE" | "MAINTENANCE" | "DECOMMISSIONED";
const API_STATUSES: APIStatus[] = ["ACTIVE", "IDLE", "MAINTENANCE", "DECOMMISSIONED"];

function statusLabel(s: APIStatus) {
  return s.charAt(0) + s.slice(1).toLowerCase();
}

type AssignmentEntry = {
  id: string;
  employeeId?: string | null;
  employeeName?: string | null;
  stationId?: string | null;
  stationName?: string | null;
  from: string;
  to: string | null;
  remark?: string | null;
};

type PosAssignmentMode = "EXCLUSIVE" | "SHARED";

type PosMachine = {
  id: string;
  code: string;
  make: string;
  model: string;
  serial: string;
  status: APIStatus;
  appVersion: string;
  remark?: string | null;
  assignmentMode: PosAssignmentMode;
  stationId?: string | null;
  station?: { id: string; name: string; code: string } | null;
  employeeId?: string | null;
  employee?: { id: string; code: string; name: string } | null;
  history: AssignmentEntry[];
};

type PosSession = {
  id: string;
  posMachineId: string;
  employeeId: string;
  employeeCode?: string | null;
  employeeName: string;
  stationId?: string | null;
  stationName?: string | null;
  startedAt: string;
  endedAt: string | null;
  note?: string | null;
  loggedBy?: string | null;
};

type StationOption = { id: string; name: string; code: string };
type EmployeeOption = { id: string; name: string; code: string; stationId?: string | null };

// ─── Static options ───────────────────────────────────────────────────────────

const MAKES = ["Verifone", "PAX Technology", "Ingenico", "Newland", "BBPOS", "Other"];
const APP_VERSIONS = ["ORO Ticket v2.4.1", "ORO Ticket v2.3.8", "ORO Ticket v2.2.5", "ORO Ticket v2.1.0"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error ?? `Request failed: ${res.status}`);
  return json as T;
}

function statusStyle(s: APIStatus): { bg: string; fg: string } {
  return s === "ACTIVE"          ? { bg: "#dcfce7", fg: "#16a34a" }
       : s === "IDLE"            ? { bg: "#fef3c7", fg: "#d97706" }
       : s === "MAINTENANCE"     ? { bg: "#fee2e2", fg: "#dc2626" }
       :                           { bg: "#f1f5f9", fg: "#64748b" };
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
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

type PosFormData = {
  make: string;
  model: string;
  serial: string;
  status: APIStatus;
  appVersion: string;
  assignmentMode: PosAssignmentMode;
  stationId: string;
  employeeId: string;
  remark: string;
};

function POSFormModal({
  initial,
  stations,
  employees,
  onSaved,
  onClose,
}: {
  initial?: PosMachine;
  stations: StationOption[];
  employees: EmployeeOption[];
  onSaved: () => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<PosFormData>({
    make: initial?.make ?? "",
    model: initial?.model ?? "",
    serial: initial?.serial ?? "",
    status: initial?.status ?? "ACTIVE",
    appVersion: initial?.appVersion ?? APP_VERSIONS[0],
    assignmentMode: initial?.assignmentMode ?? "EXCLUSIVE",
    stationId: initial?.stationId ?? "",
    employeeId: initial?.employeeId ?? "",
    remark: initial?.remark ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  const set = <K extends keyof PosFormData>(k: K, v: PosFormData[K]) => setForm(f => ({ ...f, [k]: v }));

  const isShared = form.assignmentMode === "SHARED";
  const filteredEmployees = employees.filter(e => !form.stationId || e.stationId === form.stationId);
  const valid = form.make.trim() && form.model.trim() && form.serial.trim();

  async function save() {
    if (!valid || saving) return;
    setSaving(true); setError(null);
    try {
      const payload: Record<string, unknown> = {
        make: form.make.trim(),
        model: form.model.trim(),
        serial: form.serial.trim().toUpperCase(),
        status: form.status,
        appVersion: form.appVersion,
        remark: form.remark.trim() || undefined,
      };

      if (initial) {
        // SHARED machines have no per-person custody, so their station is a
        // plain field; EXCLUSIVE machines must route station changes through
        // /assign so PosMachineHistory stays trustworthy (assignmentMode and
        // employeeId are excluded from the update schema entirely).
        if (isShared) payload.stationId = form.stationId || undefined;
        await apiFetch(`/api/pos-machines/${initial.id}`, { method: "PATCH", body: JSON.stringify(payload) });

        if (!isShared) {
          const assignChanged =
            form.stationId !== (initial.stationId ?? "") ||
            form.employeeId !== (initial.employeeId ?? "");
          if (assignChanged) {
            await apiFetch(`/api/pos-machines/${initial.id}/assign`, {
              method: "POST",
              body: JSON.stringify({
                employeeId: form.employeeId || null,
                stationId: form.stationId || null,
                fromDate: new Date().toISOString().slice(0, 10),
                remark: "",
              }),
            });
          }
        }
      } else {
        await apiFetch("/api/pos-machines", {
          method: "POST",
          body: JSON.stringify({
            ...payload,
            assignmentMode: form.assignmentMode,
            stationId: form.stationId || undefined,
            employeeId: isShared ? undefined : (form.employeeId || undefined),
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
          <select style={selCss} value={form.status} onChange={e => set("status", e.target.value as APIStatus)}>
            {API_STATUSES.map(s => <option key={s} value={s}>{statusLabel(s)}</option>)}
          </select>
        </Field>
        <Field label="ORO Ticket app version">
          <select style={selCss} value={form.appVersion} onChange={e => set("appVersion", e.target.value)}>
            {APP_VERSIONS.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </Field>

        {/* Divider */}
        <div style={{ gridColumn: "span 2", borderTop: "1px solid var(--border)", margin: "6px 0 14px" }}>
          <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--muted-foreground)", margin: "10px 0 0" }}>Assignment mode</p>
        </div>

        <Field label="Assignment mode" span2>
          {initial ? (
            <div style={{ ...selCss, display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--background)", color: "var(--muted-foreground)", cursor: "default" }}>
              <span>{isShared ? "Shared — rotates by shift" : "Exclusive — one operator"}</span>
              <span style={{ fontSize: 11 }}>Change from detail panel</span>
            </div>
          ) : (
            <select style={selCss} value={form.assignmentMode} onChange={e => {
              const v = e.target.value as PosAssignmentMode;
              set("assignmentMode", v);
              if (v === "SHARED") set("employeeId", "");
            }}>
              <option value="EXCLUSIVE">Exclusive — one operator, standard custody</option>
              <option value="SHARED">Shared — station hardware, rotates by shift/session</option>
            </select>
          )}
        </Field>

        {/* Divider */}
        <div style={{ gridColumn: "span 2", borderTop: "1px solid var(--border)", margin: "6px 0 14px" }}>
          <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--muted-foreground)", margin: "10px 0 0" }}>{isShared ? "Location" : "Current assignment"}</p>
        </div>

        <Field label="Station" span2={isShared}>
          <select style={selCss} value={form.stationId} onChange={e => { set("stationId", e.target.value); set("employeeId", ""); }}>
            <option value="">Unassigned</option>
            {stations.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        {!isShared && (
          <Field label="Assigned to (employee)">
            <select style={selCss} value={form.employeeId} onChange={e => set("employeeId", e.target.value)} disabled={!form.stationId}>
              <option value="">Unassigned</option>
              {filteredEmployees.map(e => <option key={e.id} value={e.id}>{e.code} — {e.name}</option>)}
            </select>
          </Field>
        )}

        <Field label="Remark / notes" span2>
          <textarea style={taCss} value={form.remark} onChange={e => set("remark", e.target.value)} placeholder="Any comments about condition, deployment notes, etc." />
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
          {saving && <span style={{ width: 16, height: 16, border: "2px solid #fff", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 1s linear infinite", display: "inline-block" }} />}
          {initial ? "Save changes" : "Register machine"}
        </button>
      </div>
    </Modal>
  );
}

// ─── Reassign Modal ───────────────────────────────────────────────────────────

function ReassignModal({
  pos,
  stations,
  employees,
  onSaved,
  onClose,
}: {
  pos: PosMachine;
  stations: StationOption[];
  employees: EmployeeOption[];
  onSaved: () => void;
  onClose: () => void;
}) {
  const [stationId,  setStationId]  = useState(pos.stationId ?? "");
  const [employeeId, setEmployeeId] = useState(pos.employeeId ?? "");
  const [remark,     setRemark]     = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  const filteredEmployees = employees.filter(e => !stationId || e.stationId === stationId);

  async function save() {
    setSaving(true); setError(null);
    try {
      await apiFetch(`/api/pos-machines/${pos.id}/assign`, {
        method: "POST",
        body: JSON.stringify({
          employeeId: employeeId || null,
          stationId: stationId || null,
          fromDate: new Date().toISOString().slice(0, 10),
          remark,
        }),
      });
      onSaved();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Reassignment failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Reassign POS machine" onClose={onClose}>
      <p style={{ fontSize: 13, color: "var(--muted-foreground)", marginBottom: 18 }}>
        Reassigning <strong style={{ color: "var(--foreground)" }}>{pos.serial}</strong>. The current assignment will be closed and a new history entry created.
      </p>
      <Field label="New station">
        <select style={selCss} value={stationId} onChange={e => { setStationId(e.target.value); setEmployeeId(""); }}>
          <option value="">Unassigned</option>
          {stations.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </Field>
      <Field label="Assign to employee">
        <select style={selCss} value={employeeId} onChange={e => setEmployeeId(e.target.value)} disabled={!stationId}>
          <option value="">Unassigned</option>
          {filteredEmployees.map(e => <option key={e.id} value={e.id}>{e.code} — {e.name}</option>)}
        </select>
      </Field>
      <Field label="Reason / remark">
        <textarea style={taCss} value={remark} onChange={e => setRemark(e.target.value)} placeholder="Transfer reason, condition notes…" />
      </Field>

      {error && (
        <div style={{ display: "flex", gap: 8, padding: "10px 12px", background: "#fee2e2", borderRadius: 8, marginTop: 4, marginBottom: 4 }}>
          <AlertCircle size={15} color="#dc2626" style={{ flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontSize: 13, color: "#dc2626" }}>{error}</span>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 12 }}>
        <button onClick={onClose} style={{ height: 40, padding: "0 18px", borderRadius: 10, border: "1.5px solid var(--border)", background: "var(--surface)", fontSize: 14, cursor: "pointer", color: "var(--foreground)" }}>Cancel</button>
        <button onClick={save} disabled={saving} style={{ height: 40, padding: "0 22px", borderRadius: 10, border: "none", background: "var(--primary)", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", opacity: saving ? 0.6 : 1, display: "flex", alignItems: "center", gap: 7 }}>
          {saving && <span style={{ width: 16, height: 16, border: "2px solid #fff", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 1s linear infinite", display: "inline-block" }} />}
          Confirm reassignment
        </button>
      </div>
    </Modal>
  );
}

// ─── Start session modal (SHARED machines) ────────────────────────────────────

function StartSessionModal({
  pos,
  employees,
  onSaved,
  onClose,
}: {
  pos: PosMachine;
  employees: EmployeeOption[];
  onSaved: () => void;
  onClose: () => void;
}) {
  const stationEmployees = employees.filter(e => !pos.stationId || e.stationId === pos.stationId);
  const [employeeId, setEmployeeId] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  async function save() {
    if (!employeeId || saving) return;
    setSaving(true); setError(null);
    try {
      await apiFetch(`/api/pos-machines/${pos.id}/sessions`, {
        method: "POST",
        body: JSON.stringify({ employeeId, note: note.trim() || undefined }),
      });
      onSaved();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to start session.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Start POS session" onClose={onClose}>
      <p style={{ fontSize: 13, color: "var(--muted-foreground)", marginBottom: 18 }}>
        Log an operator onto <strong style={{ color: "var(--foreground)" }}>{pos.serial}</strong>. Any currently open session on this machine will be closed automatically.
      </p>
      <Field label="Operator (employee) *">
        <select style={selCss} value={employeeId} onChange={e => setEmployeeId(e.target.value)} autoFocus>
          <option value="">Select employee…</option>
          {stationEmployees.map(e => <option key={e.id} value={e.id}>{e.code} — {e.name}</option>)}
        </select>
      </Field>
      <Field label="Note (optional)">
        <textarea style={taCss} value={note} onChange={e => setNote(e.target.value)} placeholder="Shift, handover notes, etc." />
      </Field>

      {error && (
        <div style={{ display: "flex", gap: 8, padding: "10px 12px", background: "#fee2e2", borderRadius: 8, marginTop: 4, marginBottom: 4 }}>
          <AlertCircle size={15} color="#dc2626" style={{ flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontSize: 13, color: "#dc2626" }}>{error}</span>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 12 }}>
        <button onClick={onClose} style={{ height: 40, padding: "0 18px", borderRadius: 10, border: "1.5px solid var(--border)", background: "var(--surface)", fontSize: 14, cursor: "pointer", color: "var(--foreground)" }}>Cancel</button>
        <button onClick={save} disabled={!employeeId || saving} style={{ height: 40, padding: "0 22px", borderRadius: 10, border: "none", background: "var(--primary)", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", opacity: employeeId && !saving ? 1 : 0.5, display: "flex", alignItems: "center", gap: 7 }}>
          {saving && <span style={{ width: 16, height: 16, border: "2px solid #fff", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 1s linear infinite", display: "inline-block" }} />}
          Start session
        </button>
      </div>
    </Modal>
  );
}

// ─── End session modal (SHARED machines) ──────────────────────────────────────

function EndSessionModal({
  pos,
  session,
  onSaved,
  onClose,
}: {
  pos: PosMachine;
  session: PosSession;
  onSaved: () => void;
  onClose: () => void;
}) {
  const [note, setNote] = useState(session.note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  async function confirm() {
    setSaving(true); setError(null);
    try {
      await apiFetch(`/api/pos-machines/${pos.id}/sessions/${session.id}/end`, {
        method: "POST",
        body: JSON.stringify({ note: note.trim() || undefined }),
      });
      onSaved();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to end session.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="End POS session" onClose={onClose}>
      <p style={{ fontSize: 13, color: "var(--muted-foreground)", marginBottom: 18 }}>
        End the session for <strong style={{ color: "var(--foreground)" }}>{session.employeeName}</strong> on <strong style={{ color: "var(--foreground)" }}>{pos.serial}</strong>?
      </p>
      <Field label="Note (optional)">
        <textarea style={taCss} value={note} onChange={e => setNote(e.target.value)} placeholder="Handover notes, discrepancies, etc." />
      </Field>

      {error && (
        <div style={{ display: "flex", gap: 8, padding: "10px 12px", background: "#fee2e2", borderRadius: 8, marginTop: 4, marginBottom: 4 }}>
          <AlertCircle size={15} color="#dc2626" style={{ flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontSize: 13, color: "#dc2626" }}>{error}</span>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 12 }}>
        <button onClick={onClose} style={{ height: 40, padding: "0 18px", borderRadius: 10, border: "1.5px solid var(--border)", background: "var(--surface)", fontSize: 14, cursor: "pointer", color: "var(--foreground)" }}>Cancel</button>
        <button onClick={confirm} disabled={saving} style={{ height: 40, padding: "0 22px", borderRadius: 10, border: "none", background: "#dc2626", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", opacity: saving ? 0.6 : 1, display: "flex", alignItems: "center", gap: 7 }}>
          {saving && <span style={{ width: 16, height: 16, border: "2px solid #fff", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 1s linear infinite", display: "inline-block" }} />}
          End session
        </button>
      </div>
    </Modal>
  );
}

// ─── Switch assignment mode modal ─────────────────────────────────────────────

function SwitchModeModal({
  pos,
  onSaved,
  onClose,
}: {
  pos: PosMachine;
  onSaved: () => void;
  onClose: () => void;
}) {
  const target = pos.assignmentMode === "EXCLUSIVE" ? "SHARED" : "EXCLUSIVE";
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  async function confirm() {
    setSaving(true); setError(null);
    try {
      await apiFetch(`/api/pos-machines/${pos.id}/mode`, {
        method: "POST",
        body: JSON.stringify({ assignmentMode: target }),
      });
      onSaved();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to switch mode.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`Switch to ${target === "SHARED" ? "shared" : "exclusive"} mode`} onClose={onClose}>
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start", marginBottom: 24 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: "#fef3c7", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <AlertCircle size={20} color="#d97706" />
        </div>
        <p style={{ fontSize: 14, color: "var(--muted-foreground)", lineHeight: 1.6, margin: 0 }}>
          {target === "SHARED"
            ? <>This clears <strong style={{ color: "var(--foreground)" }}>{pos.serial}</strong>&rsquo;s exclusive operator and closes its open assignment. It becomes station hardware that operators log sessions onto by shift.</>
            : <>This closes any open session on <strong style={{ color: "var(--foreground)" }}>{pos.serial}</strong>. You&rsquo;ll assign a single operator via Reassign afterward.</>
          }
        </p>
      </div>

      {error && (
        <div style={{ display: "flex", gap: 8, padding: "10px 12px", background: "#fee2e2", borderRadius: 8, marginBottom: 16 }}>
          <AlertCircle size={15} color="#dc2626" style={{ flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontSize: 13, color: "#dc2626" }}>{error}</span>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <button onClick={onClose} style={{ height: 40, padding: "0 18px", borderRadius: 10, border: "1.5px solid var(--border)", background: "var(--surface)", fontSize: 14, cursor: "pointer", color: "var(--foreground)" }}>Cancel</button>
        <button onClick={confirm} disabled={saving} style={{ height: 40, padding: "0 22px", borderRadius: 10, border: "none", background: "var(--primary)", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", opacity: saving ? 0.6 : 1, display: "flex", alignItems: "center", gap: 7 }}>
          {saving && <span style={{ width: 16, height: 16, border: "2px solid #fff", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 1s linear infinite", display: "inline-block" }} />}
          Confirm switch
        </button>
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

type Tab = "current" | "sessions" | "history";

function DetailPanel({ pos, sessions, onEdit, onDelete, onReassign, onStartSession, onEndSession, onSwitchMode, onReload }: {
  pos: PosMachine;
  sessions: PosSession[];
  onEdit: () => void;
  onDelete: () => void;
  onReassign: () => void;
  onStartSession: () => void;
  onEndSession: () => void;
  onSwitchMode: () => void;
  onReload: () => void;
}) {
  const [tab, setTab] = useState<Tab>("current");
  const ss = statusStyle(pos.status);
  const isShared = pos.assignmentMode === "SHARED";
  const openSession = sessions.find(s => s.endedAt === null) ?? null;

  // inline remark edit
  const [editingRemark, setEditingRemark] = useState(false);
  const [remarkDraft,   setRemarkDraft]   = useState(pos.remark ?? "");

  async function saveRemark() {
    try {
      await apiFetch(`/api/pos-machines/${pos.id}`, {
        method: "PATCH",
        body: JSON.stringify({ remark: remarkDraft }),
      });
      setEditingRemark(false);
      onReload();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to save remark.");
    }
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
              <Badge label={statusLabel(pos.status)} bg={ss.bg} fg={ss.fg} />
              <Badge label={isShared ? "Shared" : "Exclusive"} bg={isShared ? "#ede9fe" : "#f1f5f9"} fg={isShared ? "#7c3aed" : "#475569"} />
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
            {isShared ? (
              openSession ? (
                <button onClick={onEndSession} style={{ height: 34, padding: "0 14px", borderRadius: 8, border: "1.5px solid #fecaca", background: "#fff5f5", fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 5, color: "#dc2626", fontWeight: 500 }}>
                  <Square size={13} /> End session
                </button>
              ) : (
                <button onClick={onStartSession} style={{ height: 34, padding: "0 14px", borderRadius: 8, border: "1.5px solid var(--border)", background: "var(--surface)", fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 5, color: "var(--foreground)", fontWeight: 500 }}>
                  <Play size={13} /> Start session
                </button>
              )
            ) : (
              <button onClick={onReassign} style={{ height: 34, padding: "0 14px", borderRadius: 8, border: "1.5px solid var(--border)", background: "var(--surface)", fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 5, color: "var(--foreground)", fontWeight: 500 }}>
                <ArrowRightLeft size={13} /> Reassign
              </button>
            )}
            <button onClick={onSwitchMode} style={{ height: 34, padding: "0 14px", borderRadius: 8, border: "1.5px solid var(--border)", background: "var(--surface)", fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 5, color: "var(--foreground)", fontWeight: 500 }}>
              <Repeat size={13} /> {isShared ? "Switch to exclusive" : "Switch to shared"}
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
        <div className="grid-3" style={{ gap: 10, marginBottom: 20 }}>
          {[
            { label: "Station",       value: pos.station?.name || "Unassigned", icon: <MapPin size={13} /> },
            { label: isShared ? "Current operator" : "Operator", value: isShared ? (openSession?.employeeName || "No active session") : (pos.employee?.name || "Unassigned"), icon: <User size={13} /> },
            { label: isShared ? "Sessions" : "Assignments", value: isShared ? `${sessions.length} total` : `${pos.history.length} total`, icon: <History size={13} /> },
          ].map(s => (
            <div key={s.label} style={{ background: "var(--background)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4, color: "var(--muted-foreground)", fontSize: 11, marginBottom: 4 }}>{s.icon} {s.label}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--foreground)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Tab bar */}
        <div style={{ display: "flex", gap: 2, borderBottom: "1px solid var(--border)" }}>
          <TabBtn id="current" label="Current" />
          <TabBtn id="sessions" label="Sessions" count={sessions.length} />
          <TabBtn id="history" label="Assignment history" count={pos.history.length} />
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
            <InfoRow label="Status"        value={statusLabel(pos.status)} />
            <InfoRow label="App version"   value={pos.appVersion} accent={!isOutdated} />

            <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--muted-foreground)", marginBottom: 8, marginTop: 22 }}>{isShared ? "Current session" : "Current assignment"}</p>
            {isShared ? (
              openSession ? (
                <div style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "12px 14px", borderRadius: 10, border: "1px solid color-mix(in srgb, var(--primary) 25%, transparent)", background: "color-mix(in srgb, var(--primary) 6%, transparent)", marginBottom: 8 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 9, background: "#dcfce7", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <User size={16} color="#16a34a" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--foreground)" }}>{openSession.employeeName}</div>
                    <div style={{ fontSize: 12, color: "var(--muted-foreground)", fontFamily: "monospace", marginBottom: 4 }}>{openSession.employeeCode}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--muted-foreground)" }}>
                      <Clock size={11} /> Started {fmtDateTime(openSession.startedAt)}
                    </div>
                    {openSession.stationName && (
                      <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--muted-foreground)", marginTop: 2 }}>
                        <MapPin size={11} /> {openSession.stationName}
                      </div>
                    )}
                    {openSession.note && (
                      <div style={{ marginTop: 6, fontSize: 12, color: "var(--muted-foreground)", fontStyle: "italic" }}>{openSession.note}</div>
                    )}
                  </div>
                </div>
              ) : (
                <div style={{ padding: "14px 16px", borderRadius: 10, border: "1px dashed var(--border)", background: "var(--background)", fontSize: 13, color: "var(--muted-foreground)", textAlign: "center" }}>
                  No active session. Use <strong>Start session</strong> to log an operator on this machine.
                </div>
              )
            ) : pos.station || pos.employee ? (
              <>
                {pos.station && (
                  <div style={{ display: "flex", gap: 12, alignItems: "center", padding: "12px 14px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--background)", marginBottom: 8 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 9, background: "#dbeafe", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <MapPin size={16} color="#1d4ed8" />
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "var(--foreground)" }}>{pos.station.name}</div>
                      <div style={{ fontSize: 12, color: "var(--muted-foreground)", fontFamily: "monospace" }}>{pos.station.code}</div>
                    </div>
                  </div>
                )}
                {pos.employee && (
                  <div style={{ display: "flex", gap: 12, alignItems: "center", padding: "12px 14px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--background)", marginBottom: 8 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 9, background: "#dcfce7", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <User size={16} color="#16a34a" />
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "var(--foreground)" }}>{pos.employee.name}</div>
                      <div style={{ fontSize: 12, color: "var(--muted-foreground)", fontFamily: "monospace" }}>{pos.employee.code}</div>
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
                  <button onClick={() => { setEditingRemark(false); setRemarkDraft(pos.remark ?? ""); }} style={{ height: 34, padding: "0 14px", borderRadius: 8, border: "1.5px solid var(--border)", background: "var(--surface)", fontSize: 13, cursor: "pointer", color: "var(--foreground)" }}>Cancel</button>
                </div>
              </div>
            ) : (
              <div onClick={() => setEditingRemark(true)} style={{ padding: "12px 14px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--background)", fontSize: 14, color: pos.remark ? "var(--foreground)" : "var(--muted-foreground)", cursor: "pointer", lineHeight: 1.6, minHeight: 52 }}>
                {pos.remark || <span style={{ fontStyle: "italic" }}>Click to add a remark…</span>}
              </div>
            )}
          </div>
        )}

        {/* ── Sessions ── */}
        {tab === "sessions" && (
          <div>
            {sessions.length === 0 ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "40px 0", color: "var(--muted-foreground)" }}>
                <Play size={32} style={{ marginBottom: 10, opacity: 0.25 }} />
                <p style={{ fontSize: 13 }}>No sessions logged yet.</p>
              </div>
            ) : (
              <div style={{ position: "relative" }}>
                {/* Vertical timeline line */}
                <div style={{ position: "absolute", left: 18, top: 8, bottom: 8, width: 2, background: "var(--border)", borderRadius: 2 }} />

                {sessions.map((s) => {
                  const isCurrent = s.endedAt === null;
                  return (
                    <div key={s.id} style={{ display: "flex", gap: 16, marginBottom: 20, position: "relative" }}>
                      {/* Timeline dot */}
                      <div style={{ width: 38, height: 38, borderRadius: "50%", background: isCurrent ? "var(--primary)" : "var(--border)", border: `3px solid var(--surface)`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, zIndex: 1 }}>
                        {isCurrent
                          ? <Play size={14} color="#fff" />
                          : <Clock size={14} color="var(--muted-foreground)" />
                        }
                      </div>

                      {/* Entry card */}
                      <div style={{ flex: 1, background: isCurrent ? "color-mix(in srgb, var(--primary) 6%, transparent)" : "var(--background)", border: `1px solid ${isCurrent ? "color-mix(in srgb, var(--primary) 25%, transparent)" : "var(--border)"}`, borderRadius: 12, padding: "12px 16px", marginTop: 2 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                          <div>
                            <span style={{ fontSize: 14, fontWeight: 700, color: "var(--foreground)" }}>
                              {s.employeeName}
                            </span>
                            {isCurrent && <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, color: "var(--primary)", background: "color-mix(in srgb, var(--primary) 12%, transparent)", padding: "1px 8px", borderRadius: 999 }}>Active</span>}
                          </div>
                          <span style={{ fontSize: 11, color: "var(--muted-foreground)", fontFamily: "monospace", whiteSpace: "nowrap" }}>
                            {duration(s.startedAt, s.endedAt)}
                          </span>
                        </div>

                        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--muted-foreground)" }}>
                            <MapPin size={11} /> {s.stationName || "No station"}
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--muted-foreground)" }}>
                            <Clock size={11} />
                            {fmtDateTime(s.startedAt)} → {s.endedAt ? fmtDateTime(s.endedAt) : <strong style={{ color: "var(--primary)" }}>Present</strong>}
                          </div>
                        </div>

                        {s.note && (
                          <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--border)", fontSize: 12, color: "var(--muted-foreground)", fontStyle: "italic" }}>
                            {s.note}
                          </div>
                        )}

                        {isCurrent && (
                          <div style={{ marginTop: 10 }}>
                            <button onClick={onEndSession} style={{ height: 30, padding: "0 12px", borderRadius: 7, border: "1.5px solid #fecaca", background: "#fff5f5", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 5, color: "#dc2626", fontWeight: 500 }}>
                              <Square size={12} /> End session
                            </button>
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

        {/* ── History ── */}
        {tab === "history" && (
          <div>
            {pos.history.length === 0 ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "40px 0", color: "var(--muted-foreground)" }}>
                <History size={32} style={{ marginBottom: 10, opacity: 0.25 }} />
                <p style={{ fontSize: 13 }}>No assignment history yet.</p>
              </div>
            ) : (
              <div style={{ position: "relative" }}>
                {/* Vertical timeline line */}
                <div style={{ position: "absolute", left: 18, top: 8, bottom: 8, width: 2, background: "var(--border)", borderRadius: 2 }} />

                {[...pos.history].reverse().map((entry) => {
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

export default function POSMachinesPage() {
  const [machines,  setMachines]  = useState<PosMachine[]>([]);
  const [selected,  setSelected]  = useState<string | null>(null);
  const [activeDetail, setActiveDetail] = useState<PosMachine | null>(null);
  const [sessions,  setSessions]  = useState<PosSession[]>([]);
  const [stations,  setStations]  = useState<StationOption[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [search,    setSearch]    = useState("");
  const [filterSt,  setFilterSt]  = useState<APIStatus | "All">("All");
  const [filterStation, setFilterStation] = useState("All");
  const [modal,     setModal]     = useState<"create" | "edit" | "delete" | "reassign" | "start-session" | "end-session" | "switch-mode" | null>(null);
  const [toast,     setToast]     = useState<string | null>(null);

  const loadMachines = useCallback(async () => {
    try {
      const res = await apiFetch<{ data: PosMachine[] }>("/api/pos-machines");
      setMachines(res.data);
    } catch (e) { console.error(e); }
  }, []);

  const loadStations = useCallback(async () => {
    try {
      const res = await apiFetch<{ data: StationOption[] }>("/api/stations?limit=1000");
      setStations(res.data);
    } catch (e) { console.error(e); }
  }, []);

  const loadEmployees = useCallback(async () => {
    try {
      const res = await apiFetch<{ data: { id: string; code: string; fullName: string; stationId?: string | null }[] }>("/api/employees?limit=1000");
      setEmployees(res.data.map(e => ({ id: e.id, code: e.code, name: e.fullName, stationId: e.stationId })));
    } catch (e) { console.error(e); }
  }, []);

  const loadActiveDetail = useCallback(async (id: string) => {
    try {
      const res = await apiFetch<Omit<PosMachine, "history"> & {
        history: {
          id: string;
          employee: { id: string; code: string; name: string } | null;
          employeeName: string | null;
          station: { id: string; code: string; name: string } | null;
          stationName: string | null;
          fromDate: string;
          toDate: string | null;
          remark: string | null;
        }[];
      }>(`/api/pos-machines/${id}`);
      const mapped: PosMachine = {
        ...res,
        history: res.history.map(h => ({
          id: h.id,
          employeeId: h.employee?.id ?? null,
          employeeName: h.employee?.name ?? h.employeeName,
          stationId: h.station?.id ?? null,
          stationName: h.station?.name ?? h.stationName,
          from: h.fromDate,
          to: h.toDate,
          remark: h.remark,
        })),
      };
      setActiveDetail(mapped);
    } catch (e) {
      setActiveDetail(null);
      console.error(e);
    }
  }, []);

  const loadSessions = useCallback(async (id: string) => {
    try {
      const res = await apiFetch<{ data: PosSession[] }>(`/api/pos-machines/${id}/sessions`);
      setSessions(res.data);
    } catch (e) {
      setSessions([]);
      console.error(e);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([loadMachines(), loadStations(), loadEmployees()]).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [loadMachines, loadStations, loadEmployees]);

  useEffect(() => {
    if (selected) {
      loadActiveDetail(selected);
      loadSessions(selected);
    } else {
      setActiveDetail(null);
      setSessions([]);
    }
  }, [selected, loadActiveDetail, loadSessions]);

  const filtered = useMemo(() => machines.filter(m => {
    const term = search.toLowerCase();
    const nameMatch = m.serial.toLowerCase().includes(term) || m.make.toLowerCase().includes(term) || m.model.toLowerCase().includes(term) || m.code.toLowerCase().includes(term);
    const stMatch   = filterSt === "All" || m.status === filterSt;
    const stationMatch = filterStation === "All" || m.stationId === filterStation;
    return nameMatch && stMatch && stationMatch;
  }), [machines, search, filterSt, filterStation]);

  async function handleSaved() {
    await loadMachines();
    if (selected) {
      await loadActiveDetail(selected);
      await loadSessions(selected);
    }
    setToast(
      modal === "create" ? "POS machine registered" :
      modal === "reassign" ? "POS machine reassigned" :
      modal === "start-session" ? "Session started" :
      modal === "end-session" ? "Session ended" :
      modal === "switch-mode" ? "Assignment mode switched" :
      "POS machine updated"
    );
    setModal(null);
  }

  async function handleDelete() {
    if (!activeDetail) return;
    try {
      await apiFetch(`/api/pos-machines/${activeDetail.id}`, { method: "DELETE" });
      await loadMachines();
      setSelected(null);
      setActiveDetail(null);
      setToast("POS machine removed");
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Delete failed");
    }
    setModal(null);
  }

  const active = activeDetail;

  // Summary counts
  const counts = {
    active:      machines.filter(m => m.status === "ACTIVE").length,
    idle:        machines.filter(m => m.status === "IDLE").length,
    maintenance: machines.filter(m => m.status === "MAINTENANCE").length,
    outdated:    machines.filter(m => m.appVersion !== APP_VERSIONS[0]).length,
  };

  return (
    <>
      <style>{`
        @keyframes fadeUp { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
        @keyframes spin { to { transform: rotate(360deg); } }
        * { box-sizing:border-box; }
      `}</style>

      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
      {modal === "create"   && <POSFormModal stations={stations} employees={employees} onSaved={handleSaved} onClose={() => setModal(null)} />}
      {modal === "edit"     && active && <POSFormModal initial={active} stations={stations} employees={employees} onSaved={handleSaved} onClose={() => setModal(null)} />}
      {modal === "delete"   && active && <DeleteModal serial={active.serial} onConfirm={handleDelete} onClose={() => setModal(null)} />}
      {modal === "reassign" && active && <ReassignModal pos={active} stations={stations} employees={employees} onSaved={handleSaved} onClose={() => setModal(null)} />}
      {modal === "start-session" && active && <StartSessionModal pos={active} employees={employees} onSaved={handleSaved} onClose={() => setModal(null)} />}
      {modal === "end-session"   && active && sessions.find(s => s.endedAt === null) && (
        <EndSessionModal pos={active} session={sessions.find(s => s.endedAt === null)!} onSaved={handleSaved} onClose={() => setModal(null)} />
      )}
      {modal === "switch-mode" && active && <SwitchModeModal pos={active} onSaved={handleSaved} onClose={() => setModal(null)} />}

      <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "var(--background)", overflow: "hidden" }}>

        {/* Top bar */}
        <div style={{ padding: "24px 28px 0", flexShrink: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
            <div>
              <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--foreground)", margin: 0 }}>POS Machines</h1>
              <p style={{ fontSize: 13, color: "var(--muted-foreground)", margin: "3px 0 0" }}>
                {loading ? "Loading…" : `${machines.length} machines · ${counts.active} active · ${counts.idle} idle · ${counts.maintenance} in maintenance`}
                {counts.outdated > 0 && <span style={{ color: "#d97706", fontWeight: 600 }}> · {counts.outdated} need app update</span>}
              </p>
            </div>
            <button onClick={() => setModal("create")} style={{ height: 40, padding: "0 18px", borderRadius: 10, border: "none", background: "var(--primary)", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 7 }}>
              <Plus size={16} strokeWidth={2.5} /> Register POS
            </button>
          </div>
        </div>

        {/* Split pane */}
        <div className="split-panel" style={{ ["--split-left" as string]: "320px", flex: 1, overflow: "hidden" } as React.CSSProperties}>

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
                <select style={{ ...selCss, height: 34, fontSize: 12 }} value={filterSt} onChange={e => setFilterSt(e.target.value as APIStatus | "All")}>
                  <option value="All">All statuses</option>
                  {API_STATUSES.map(s => <option key={s} value={s}>{statusLabel(s)}</option>)}
                </select>
                <select style={{ ...selCss, height: 34, fontSize: 12 }} value={filterStation} onChange={e => setFilterStation(e.target.value)}>
                  <option value="All">All stations</option>
                  {stations.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            </div>

            {/* Machine list */}
            <div style={{ flex: 1, overflowY: "auto" }}>
              {loading && filtered.length === 0 && (
                <div style={{ padding: 40, textAlign: "center", color: "var(--muted-foreground)", fontSize: 13 }}>Loading machines…</div>
              )}
              {!loading && filtered.length === 0 && (
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
                      <Badge label={statusLabel(m.status)} bg={ss.bg} fg={ss.fg} />
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
                  sessions={sessions}
                  onEdit={() => setModal("edit")}
                  onDelete={() => setModal("delete")}
                  onReassign={() => setModal("reassign")}
                  onStartSession={() => setModal("start-session")}
                  onEndSession={() => setModal("end-session")}
                  onSwitchMode={() => setModal("switch-mode")}
                  onReload={() => { if (selected) { loadActiveDetail(selected); loadSessions(selected); } }}
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
