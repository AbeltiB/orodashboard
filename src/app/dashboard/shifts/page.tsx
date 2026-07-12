"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarClock, Plus, Pencil, Trash2, X, Check,
  AlertCircle, MapPin, User, Monitor, Upload, History,
  Loader2, FileText,
} from "lucide-react";

// ─── Types matching the shifts API ─────────────────────────────────────────────

type EmployeeRole = "SUPERVISOR" | "TICKETER" | "CASHIER";
const EMPLOYEE_ROLES: EmployeeRole[] = ["SUPERVISOR", "TICKETER", "CASHIER"];

type ShiftType = "MORNING" | "AFTERNOON";
const SHIFT_TYPES: ShiftType[] = ["MORNING", "AFTERNOON"];

function roleLabel(r: EmployeeRole) {
  return r.charAt(0) + r.slice(1).toLowerCase();
}
function shiftLabel(s: ShiftType) {
  return s === "MORNING" ? "Morning" : "Afternoon";
}

type ShiftAssignment = {
  id: string;
  employeeId: string;
  employee: { id: string; code: string; name: string } | null;
  stationId: string;
  station: { id: string; name: string; code: string } | null;
  date: string;
  shiftType: ShiftType;
  role: EmployeeRole;
  posMachineId: string | null;
  posMachine: { id: string; code: string; serial: string } | null;
  source: string;
  externalRef: string | null;
  importBatchId: string | null;
};

type ImportBatch = {
  id: string;
  fileName: string;
  importedBy: string;
  rowCount: number;
  successCount: number;
  errorCount: number;
  errors: { row: number; message: string }[] | null;
  createdAt: string;
};

type StationOption = { id: string; name: string; code: string };
type EmployeeOption = { id: string; name: string; code: string; stationId?: string | null };
type PosMachineOption = { id: string; code: string; serial: string; stationId?: string | null };

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

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
}
function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function shiftStyle(s: ShiftType): { bg: string; fg: string } {
  return s === "MORNING" ? { bg: "#dbeafe", fg: "#1d4ed8" } : { bg: "#fef3c7", fg: "#d97706" };
}

// ─── Shared UI ────────────────────────────────────────────────────────────────

const iCss: React.CSSProperties = {
  width: "100%", height: 42, padding: "0 12px",
  border: "1.5px solid var(--border)", borderRadius: 10,
  background: "var(--surface)", color: "var(--foreground)",
  fontSize: 14, outline: "none",
};
const selCss: React.CSSProperties = { ...iCss, cursor: "pointer" };

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

// ─── Shift form modal (manual create / edit) ───────────────────────────────────

type ShiftFormData = {
  employeeId: string;
  stationId: string;
  date: string;
  shiftType: ShiftType;
  role: EmployeeRole;
  posMachineId: string;
};

function ShiftFormModal({
  initial,
  stations,
  employees,
  posMachines,
  onSaved,
  onClose,
}: {
  initial?: ShiftAssignment;
  stations: StationOption[];
  employees: EmployeeOption[];
  posMachines: PosMachineOption[];
  onSaved: () => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<ShiftFormData>({
    employeeId: initial?.employeeId ?? "",
    stationId: initial?.stationId ?? "",
    date: initial?.date?.slice(0, 10) ?? "",
    shiftType: initial?.shiftType ?? "MORNING",
    role: initial?.role ?? "TICKETER",
    posMachineId: initial?.posMachineId ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  const set = <K extends keyof ShiftFormData>(k: K, v: ShiftFormData[K]) => setForm(f => ({ ...f, [k]: v }));

  const stationPosMachines = posMachines.filter(p => !form.stationId || p.stationId === form.stationId);
  const valid = form.employeeId && form.stationId && form.date;

  async function save() {
    if (!valid || saving) return;
    setSaving(true); setError(null);
    try {
      if (initial) {
        await apiFetch(`/api/shifts/${initial.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            stationId: form.stationId,
            role: form.role,
            posMachineId: form.posMachineId || undefined,
          }),
        });
      } else {
        await apiFetch("/api/shifts", {
          method: "POST",
          body: JSON.stringify({
            employeeId: form.employeeId,
            stationId: form.stationId,
            date: form.date,
            shiftType: form.shiftType,
            role: form.role,
            posMachineId: form.posMachineId || undefined,
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
    <Modal title={initial ? "Edit shift assignment" : "Add shift assignment"} wide onClose={onClose}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
        <Field label="Employee *">
          <select style={selCss} value={form.employeeId} onChange={e => set("employeeId", e.target.value)} disabled={!!initial}>
            <option value="">Select employee…</option>
            {employees.map(e => <option key={e.id} value={e.id}>{e.code} — {e.name}</option>)}
          </select>
        </Field>
        <Field label="Date *">
          <input type="date" style={iCss} value={form.date} onChange={e => set("date", e.target.value)} disabled={!!initial} />
        </Field>
        <Field label="Shift *">
          <select style={selCss} value={form.shiftType} onChange={e => set("shiftType", e.target.value as ShiftType)} disabled={!!initial}>
            {SHIFT_TYPES.map(s => <option key={s} value={s}>{shiftLabel(s)}</option>)}
          </select>
        </Field>
        <Field label="Role covered *">
          <select style={selCss} value={form.role} onChange={e => set("role", e.target.value as EmployeeRole)}>
            {EMPLOYEE_ROLES.map(r => <option key={r} value={r}>{roleLabel(r)}</option>)}
          </select>
        </Field>

        <div style={{ gridColumn: "span 2", borderTop: "1px solid var(--border)", margin: "6px 0 14px" }}>
          <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--muted-foreground)", margin: "10px 0 0" }}>Deployment</p>
        </div>

        <Field label="Station *">
          <select style={selCss} value={form.stationId} onChange={e => { set("stationId", e.target.value); set("posMachineId", ""); }}>
            <option value="">Select station…</option>
            {stations.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <Field label="POS machine (optional)">
          <select style={selCss} value={form.posMachineId} onChange={e => set("posMachineId", e.target.value)} disabled={!form.stationId}>
            <option value="">Unassigned</option>
            {stationPosMachines.map(p => <option key={p.id} value={p.id}>{p.code} — {p.serial}</option>)}
          </select>
        </Field>
      </div>

      {initial && (
        <p style={{ fontSize: 12, color: "var(--muted-foreground)", margin: "0 0 4px" }}>
          Employee, date and shift are fixed once created — remove and re-add to change them.
        </p>
      )}

      {error && (
        <div style={{ display: "flex", gap: 8, padding: "10px 12px", background: "#fee2e2", borderRadius: 8, marginTop: 10, marginBottom: 4 }}>
          <AlertCircle size={15} color="#dc2626" style={{ flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontSize: 13, color: "#dc2626" }}>{error}</span>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 12 }}>
        <button onClick={onClose} style={{ height: 40, padding: "0 18px", borderRadius: 10, border: "1.5px solid var(--border)", background: "var(--surface)", fontSize: 14, cursor: "pointer", color: "var(--foreground)" }}>Cancel</button>
        <button onClick={save} disabled={!valid || saving} style={{ height: 40, padding: "0 22px", borderRadius: 10, border: "none", background: "var(--primary)", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", opacity: valid && !saving ? 1 : 0.5, display: "flex", alignItems: "center", gap: 7 }}>
          {saving && <span style={{ width: 16, height: 16, border: "2px solid #fff", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 1s linear infinite", display: "inline-block" }} />}
          {initial ? "Save changes" : "Add shift"}
        </button>
      </div>
    </Modal>
  );
}

// ─── Delete modal ─────────────────────────────────────────────────────────────

function DeleteModal({ label, onConfirm, onClose }: { label: string; onConfirm: () => void; onClose: () => void }) {
  return (
    <Modal title="Remove shift assignment" onClose={onClose}>
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start", marginBottom: 24 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: "#fee2e2", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <AlertCircle size={20} color="#dc2626" />
        </div>
        <p style={{ fontSize: 14, color: "var(--muted-foreground)", lineHeight: 1.6, margin: 0 }}>
          Remove <strong style={{ color: "var(--foreground)" }}>{label}</strong> from the schedule? This cannot be undone.
        </p>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <button onClick={onClose} style={{ height: 40, padding: "0 18px", borderRadius: 10, border: "1.5px solid var(--border)", background: "var(--surface)", fontSize: 14, cursor: "pointer", color: "var(--foreground)" }}>Cancel</button>
        <button onClick={onConfirm} style={{ height: 40, padding: "0 22px", borderRadius: 10, border: "none", background: "#dc2626", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Remove</button>
      </div>
    </Modal>
  );
}

// ─── Import modal ──────────────────────────────────────────────────────────────

function ImportModal({ onImported, onClose }: { onImported: () => void; onClose: () => void }) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [content, setContent]   = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [result, setResult]     = useState<{ batchId: string; rowCount: number; successCount: number; errorCount: number; errors: { row: number; message: string }[] } | null>(null);

  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [loadingBatches, setLoadingBatches] = useState(true);
  const [expandedBatch, setExpandedBatch] = useState<string | null>(null);

  const loadBatches = useCallback(async () => {
    setLoadingBatches(true);
    try {
      const res = await apiFetch<{ data: ImportBatch[] }>("/api/shifts/import");
      setBatches(res.data);
    } catch {
      // batch history is a nice-to-have — a failed load shouldn't block importing
    } finally {
      setLoadingBatches(false);
    }
  }, []);

  useEffect(() => { loadBatches(); }, [loadBatches]);

  function handleFile(file: File) {
    setError(null); setResult(null);
    const reader = new FileReader();
    reader.onload = () => {
      setFileName(file.name);
      setContent(String(reader.result ?? ""));
    };
    reader.onerror = () => setError("Could not read that file.");
    reader.readAsText(file);
  }

  async function upload() {
    if (!fileName || !content || uploading) return;
    setUploading(true); setError(null); setResult(null);
    try {
      const res = await apiFetch<{ batchId: string; rowCount: number; successCount: number; errorCount: number; errors: { row: number; message: string }[] }>(
        "/api/shifts/import",
        { method: "POST", body: JSON.stringify({ fileName, content }) }
      );
      setResult(res);
      setFileName(null);
      setContent(null);
      loadBatches();
      onImported();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <Modal title="Import weekly schedule" wide onClose={onClose}>
      <p style={{ fontSize: 13, color: "var(--muted-foreground)", marginBottom: 16, lineHeight: 1.6 }}>
        Upload the CSV or JSON export from the scheduler system. Columns: <code style={{ fontSize: 12 }}>employee_code, station_code, date, shift, role, pos_machine_code</code> (last one optional).
        Re-importing the same file updates existing rows instead of duplicating them.
      </p>

      <label
        style={{
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          gap: 8, padding: "28px 16px", borderRadius: 12, border: "2px dashed var(--border)",
          background: "var(--background)", cursor: "pointer", marginBottom: 16,
        }}
      >
        <Upload size={22} color="var(--muted-foreground)" />
        <span style={{ fontSize: 13, color: "var(--foreground)", fontWeight: 600 }}>
          {fileName ?? "Click to choose a .csv or .json file"}
        </span>
        <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>or drag and drop</span>
        <input
          type="file"
          accept=".csv,.json,text/csv,application/json"
          style={{ display: "none" }}
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />
      </label>

      {error && (
        <div style={{ display: "flex", gap: 8, padding: "10px 12px", background: "#fee2e2", borderRadius: 8, marginBottom: 16 }}>
          <AlertCircle size={15} color="#dc2626" style={{ flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontSize: 13, color: "#dc2626" }}>{error}</span>
        </div>
      )}

      {result && (
        <div style={{ padding: "14px 16px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--background)", marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: result.errors.length ? 10 : 0 }}>
            <Badge label={`${result.rowCount} rows`} bg="#f1f5f9" fg="#475569" />
            <Badge label={`${result.successCount} saved`} bg="#dcfce7" fg="#16a34a" />
            {result.errorCount > 0 && <Badge label={`${result.errorCount} failed`} bg="#fee2e2" fg="#dc2626" />}
          </div>
          {result.errors.length > 0 && (
            <div style={{ maxHeight: 140, overflowY: "auto" }}>
              {result.errors.map((e, i) => (
                <div key={i} style={{ fontSize: 12, color: "#dc2626", padding: "3px 0" }}>Row {e.row}: {e.message}</div>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginBottom: 22 }}>
        <button onClick={upload} disabled={!fileName || uploading} style={{ height: 40, padding: "0 22px", borderRadius: 10, border: "none", background: "var(--primary)", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", opacity: fileName && !uploading ? 1 : 0.5, display: "flex", alignItems: "center", gap: 7 }}>
          {uploading && <Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} />}
          Import
        </button>
      </div>

      <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--muted-foreground)", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
        <History size={12} /> Import history
      </p>
      {loadingBatches ? (
        <div style={{ padding: "16px 0", textAlign: "center", color: "var(--muted-foreground)", fontSize: 13 }}>Loading…</div>
      ) : batches.length === 0 ? (
        <div style={{ padding: "16px 0", textAlign: "center", color: "var(--muted-foreground)", fontSize: 13 }}>No imports yet.</div>
      ) : (
        <div>
          {batches.map(b => (
            <div key={b.id} style={{ border: "1px solid var(--border)", borderRadius: 10, marginBottom: 8, overflow: "hidden" }}>
              <button
                onClick={() => setExpandedBatch(expandedBatch === b.id ? null : b.id)}
                style={{ width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "var(--background)", border: "none", cursor: "pointer" }}
              >
                <FileText size={14} color="var(--muted-foreground)" style={{ flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{b.fileName}</div>
                  <div style={{ fontSize: 11, color: "var(--muted-foreground)" }}>{fmtDateTime(b.createdAt)}</div>
                </div>
                <Badge label={`${b.successCount}/${b.rowCount}`} bg={b.errorCount ? "#fef3c7" : "#dcfce7"} fg={b.errorCount ? "#d97706" : "#16a34a"} />
              </button>
              {expandedBatch === b.id && b.errors && b.errors.length > 0 && (
                <div style={{ padding: "8px 12px 10px", borderTop: "1px solid var(--border)" }}>
                  {b.errors.map((e, i) => (
                    <div key={i} style={{ fontSize: 12, color: "#dc2626", padding: "2px 0" }}>Row {e.row}: {e.message}</div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ShiftsPage() {
  const [shifts,    setShifts]    = useState<ShiftAssignment[]>([]);
  const [stations,  setStations]  = useState<StationOption[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [posMachines, setPosMachines] = useState<PosMachineOption[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [toast,     setToast]     = useState<string | null>(null);

  const [filterStation,  setFilterStation]  = useState("All");
  const [filterEmployee, setFilterEmployee] = useState("All");
  const [filterShiftType, setFilterShiftType] = useState<ShiftType | "All">("All");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo,   setDateTo]   = useState("");

  const [modal, setModal] = useState<"create" | "edit" | "delete" | "import" | null>(null);
  const [activeShift, setActiveShift] = useState<ShiftAssignment | null>(null);

  const loadShifts = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: "500" });
      if (filterStation !== "All") params.set("stationId", filterStation);
      if (filterEmployee !== "All") params.set("employeeId", filterEmployee);
      if (filterShiftType !== "All") params.set("shiftType", filterShiftType);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      const res = await apiFetch<{ data: ShiftAssignment[] }>(`/api/shifts?${params.toString()}`);
      setShifts(res.data);
    } catch (e) { console.error(e); }
  }, [filterStation, filterEmployee, filterShiftType, dateFrom, dateTo]);

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

  const loadPosMachines = useCallback(async () => {
    try {
      const res = await apiFetch<{ data: { id: string; code: string; serial: string; stationId?: string | null }[] }>("/api/pos-machines?limit=1000");
      setPosMachines(res.data.map(p => ({ id: p.id, code: p.code, serial: p.serial, stationId: p.stationId })));
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([loadStations(), loadEmployees(), loadPosMachines()]).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [loadStations, loadEmployees, loadPosMachines]);

  useEffect(() => { loadShifts(); }, [loadShifts]);

  const grouped = useMemo(() => {
    const sorted = [...shifts].sort((a, b) => a.date.localeCompare(b.date) || a.shiftType.localeCompare(b.shiftType));
    const map = new Map<string, ShiftAssignment[]>();
    for (const s of sorted) {
      const key = s.date.slice(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    return [...map.entries()];
  }, [shifts]);

  async function handleSaved() {
    await loadShifts();
    setToast(modal === "create" ? "Shift assignment added" : "Shift assignment updated");
    setModal(null);
  }

  async function handleDelete() {
    if (!activeShift) return;
    try {
      await apiFetch(`/api/shifts/${activeShift.id}`, { method: "DELETE" });
      await loadShifts();
      setToast("Shift assignment removed");
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Delete failed");
    }
    setModal(null);
    setActiveShift(null);
  }

  return (
    <>
      <style>{`
        @keyframes fadeUp { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
        @keyframes spin { to { transform: rotate(360deg); } }
        * { box-sizing:border-box; }
      `}</style>

      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
      {modal === "create" && (
        <ShiftFormModal stations={stations} employees={employees} posMachines={posMachines} onSaved={handleSaved} onClose={() => setModal(null)} />
      )}
      {modal === "edit" && activeShift && (
        <ShiftFormModal initial={activeShift} stations={stations} employees={employees} posMachines={posMachines} onSaved={handleSaved} onClose={() => setModal(null)} />
      )}
      {modal === "delete" && activeShift && (
        <DeleteModal
          label={`${activeShift.employee?.name ?? "this employee"}'s ${shiftLabel(activeShift.shiftType).toLowerCase()} shift on ${fmtDate(activeShift.date)}`}
          onConfirm={handleDelete}
          onClose={() => setModal(null)}
        />
      )}
      {modal === "import" && <ImportModal onImported={loadShifts} onClose={() => setModal(null)} />}

      <div style={{ minHeight: "100vh", background: "var(--background)", padding: "24px 28px" }}>

        {/* Top bar */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--foreground)", margin: 0 }}>Shift Schedule</h1>
            <p style={{ fontSize: 13, color: "var(--muted-foreground)", margin: "3px 0 0" }}>
              {loading ? "Loading…" : `${shifts.length} shift${shifts.length === 1 ? "" : "s"} in view`}
            </p>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => setModal("import")} style={{ height: 40, padding: "0 16px", borderRadius: 10, border: "1.5px solid var(--border)", background: "var(--surface)", fontSize: 14, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 7, color: "var(--foreground)" }}>
              <Upload size={15} /> Import schedule
            </button>
            <button onClick={() => setModal("create")} style={{ height: 40, padding: "0 18px", borderRadius: 10, border: "none", background: "var(--primary)", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 7 }}>
              <Plus size={16} strokeWidth={2.5} /> Add shift
            </button>
          </div>
        </div>

        {/* Filters */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginBottom: 20, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 14 }}>
          <select style={{ ...selCss, height: 36, fontSize: 13 }} value={filterStation} onChange={e => setFilterStation(e.target.value)}>
            <option value="All">All stations</option>
            {stations.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select style={{ ...selCss, height: 36, fontSize: 13 }} value={filterEmployee} onChange={e => setFilterEmployee(e.target.value)}>
            <option value="All">All employees</option>
            {employees.map(e => <option key={e.id} value={e.id}>{e.code} — {e.name}</option>)}
          </select>
          <select style={{ ...selCss, height: 36, fontSize: 13 }} value={filterShiftType} onChange={e => setFilterShiftType(e.target.value as ShiftType | "All")}>
            <option value="All">All shifts</option>
            {SHIFT_TYPES.map(s => <option key={s} value={s}>{shiftLabel(s)}</option>)}
          </select>
          <input type="date" style={{ ...iCss, height: 36, fontSize: 13 }} value={dateFrom} onChange={e => setDateFrom(e.target.value)} title="From date" />
          <input type="date" style={{ ...iCss, height: 36, fontSize: 13 }} value={dateTo} onChange={e => setDateTo(e.target.value)} title="To date" />
        </div>

        {/* Schedule */}
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--muted-foreground)", fontSize: 13 }}>Loading schedule…</div>
        ) : grouped.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "60px 0", color: "var(--muted-foreground)" }}>
            <CalendarClock size={36} style={{ marginBottom: 12, opacity: 0.25 }} />
            <p style={{ fontSize: 14 }}>No shifts match these filters.</p>
            <p style={{ fontSize: 12, marginTop: 4 }}>Add one manually or import the weekly schedule.</p>
          </div>
        ) : (
          grouped.map(([date, dayShifts]) => (
            <div key={date} style={{ marginBottom: 18 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
                {fmtDate(date)}
              </p>
              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
                {dayShifts.map((s, i) => {
                  const ss = shiftStyle(s.shiftType);
                  return (
                    <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 16px", borderBottom: i < dayShifts.length - 1 ? "1px solid var(--border)" : "none" }}>
                      <Badge label={shiftLabel(s.shiftType)} bg={ss.bg} fg={ss.fg} />
                      <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 160 }}>
                        <User size={13} color="var(--muted-foreground)" />
                        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)" }}>{s.employee?.name ?? "Unknown"}</span>
                        <span style={{ fontSize: 11, color: "var(--muted-foreground)", fontFamily: "monospace" }}>{s.employee?.code}</span>
                      </div>
                      <Badge label={roleLabel(s.role)} bg="#f1f5f9" fg="#475569" />
                      <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 130 }}>
                        <MapPin size={13} color="var(--muted-foreground)" />
                        <span style={{ fontSize: 13, color: "var(--foreground)" }}>{s.station?.name ?? "—"}</span>
                      </div>
                      {s.posMachine && (
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <Monitor size={13} color="var(--muted-foreground)" />
                          <span style={{ fontSize: 12, color: "var(--muted-foreground)", fontFamily: "monospace" }}>{s.posMachine.serial}</span>
                        </div>
                      )}
                      <span style={{ fontSize: 11, color: "var(--muted-foreground)", marginLeft: "auto" }}>
                        {s.source === "import" ? "Imported" : "Manual"}
                      </span>
                      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                        <button onClick={() => { setActiveShift(s); setModal("edit"); }} style={{ width: 30, height: 30, borderRadius: 8, border: "1.5px solid var(--border)", background: "var(--surface)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--foreground)" }}>
                          <Pencil size={13} />
                        </button>
                        <button onClick={() => { setActiveShift(s); setModal("delete"); }} style={{ width: 30, height: 30, borderRadius: 8, border: "1.5px solid #fecaca", background: "#fff5f5", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#dc2626" }}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}
