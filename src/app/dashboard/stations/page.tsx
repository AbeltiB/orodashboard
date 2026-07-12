"use client";

import { useState, useEffect, useCallback } from "react";
import {
  MapPin, Plus, Pencil, Trash2, X, Check, ChevronRight,
  Users, Monitor, Navigation, Building2, Search, AlertCircle,
  Loader2, Layers, UserPlus, ShieldCheck,
} from "lucide-react";

// ─── Types — mirror the API response shape ────────────────────────────────────

type RoadType = "asphalt" | "gravel" | "mixed";

type TerminalRef = {
  id: string;
  name: string;
  isStation: boolean;
  linkedStationId: string | null;
  isDeparture: boolean;
  isArrival: boolean;
  distanceKm: number;
  roadType: RoadType;
  asphaltKm: number | null;
  gravelKm: number | null;
};

type StationCounts = {
  terminalsAsOrigin: number;
  employees: number;
  posMachines: number;
};

type ZoneRef = { id: string; name: string; region: string };

type Station = {
  id: string;
  code: string;
  name: string;
  region: string;
  zoneId: string | null;
  zone: ZoneRef | null;
  location: string;
  terminals: TerminalRef[];
  counts: StationCounts;
};

type ZoneSupervisorRef = { employeeId: string; name: string; employeeCode: string; assignedAt: string };

type ZoneDetail = ZoneRef & {
  description: string | null;
  stationCount: number;
  supervisors: ZoneSupervisorRef[];
};

type SupervisorOption = { id: string; firstName: string; lastName: string; code: string };

// ─── Regions (must match Prisma Region enum values) ───────────────────────────

const REGIONS: { value: string; label: string }[] = [
  { value: "ADDIS_ABABA",        label: "Addis Ababa"       },
  { value: "OROMIA",             label: "Oromia"            },
  { value: "AMHARA",             label: "Amhara"            },
  { value: "TIGRAY",             label: "Tigray"            },
  { value: "SNNPR",              label: "SNNPR"             },
  { value: "AFAR",               label: "Afar"              },
  { value: "SOMALI",             label: "Somali"            },
  { value: "BENISHANGUL_GUMUZ",  label: "Benishangul-Gumuz" },
  { value: "GAMBELA",            label: "Gambela"           },
  { value: "HARARI",             label: "Harari"            },
  { value: "DIRE_DAWA",          label: "Dire Dawa"         },
  { value: "SIDAMA",             label: "Sidama"            },
];

function regionLabel(value: string) {
  return REGIONS.find(r => r.value === value)?.label ?? value;
}

// ─── API helpers ──────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error ?? `Request failed: ${res.status}`);
  return json as T;
}

// ─── Shared UI ────────────────────────────────────────────────────────────────

function Badge({ label, color }: { label: string; color: "blue" | "green" | "slate" | "amber" }) {
  const map = {
    blue:  { bg: "#dbeafe", fg: "#1d4ed8" },
    green: { bg: "#dcfce7", fg: "#16a34a" },
    slate: { bg: "#f1f5f9", fg: "#475569" },
    amber: { bg: "#fef3c7", fg: "#d97706" },
  };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 600, background: map[color].bg, color: map[color].fg }}>
      {label}
    </span>
  );
}

function Toast({ message, type = "success", onDone }: { message: string; type?: "success" | "error"; onDone: () => void }) {
  useEffect(() => { const t = setTimeout(onDone, 2600); return () => clearTimeout(t); }, [onDone]);
  return (
    <div style={{ position: "fixed", bottom: 28, right: 28, zIndex: 9999, background: "#0f172a", color: "#fff", padding: "12px 20px", borderRadius: 12, fontSize: 14, fontWeight: 500, display: "flex", alignItems: "center", gap: 8, boxShadow: "0 8px 30px rgb(0 0 0/0.18)", animation: "fadeUp 0.22s ease" }}>
      {type === "success"
        ? <Check size={15} strokeWidth={2.5} color="#4ade80" />
        : <AlertCircle size={15} color="#f87171" />}
      {message}
    </div>
  );
}

function Spinner() {
  return <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} color="var(--muted-foreground)" />;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgb(0 0 0/0.35)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: "var(--surface)", borderRadius: 18, width: "100%", maxWidth: 560, boxShadow: "0 24px 60px rgb(0 0 0/0.18)", border: "1px solid var(--border)", maxHeight: "90vh", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 24px 0" }}>
          <span style={{ fontSize: 17, fontWeight: 700, color: "var(--foreground)" }}>{title}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", padding: 4 }}><X size={18} /></button>
        </div>
        <div style={{ padding: "20px 24px 24px", overflowY: "auto" }}>{children}</div>
      </div>
    </div>
  );
}

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

type StationFormData = { name: string; region: string; zoneId: string; location: string };

function StationFormModal({ initial, onSave, onClose }: {
  initial?: Station;
  onSave: (s: Station) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<StationFormData>({
    name:     initial?.name     ?? "",
    region:   initial?.region   ?? "",
    zoneId:   initial?.zoneId   ?? "",
    location: initial?.location ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);
  const set = <K extends keyof StationFormData>(k: K, v: string) => setForm(f => ({ ...f, [k]: v }));
  const valid = form.name.trim() && form.region && form.location.trim();

  // Zones scoped to the currently-selected region
  const [zones, setZones] = useState<ZoneRef[]>([]);
  const [zonesLoading, setZonesLoading] = useState(false);
  const [newZoneOpen, setNewZoneOpen] = useState(false);
  const [newZoneName, setNewZoneName] = useState("");
  const [newZoneSaving, setNewZoneSaving] = useState(false);

  const loadZones = useCallback(async (region: string) => {
    if (!region) { setZones([]); return; }
    setZonesLoading(true);
    try {
      const res = await apiFetch<{ data: ZoneRef[] }>(`/api/zones?region=${region}`);
      setZones(res.data);
    } catch {
      setZones([]);
    } finally {
      setZonesLoading(false);
    }
  }, []);

  useEffect(() => { loadZones(form.region); }, [form.region, loadZones]);

  async function createZone() {
    if (!newZoneName.trim() || !form.region || newZoneSaving) return;
    setNewZoneSaving(true);
    try {
      const zone = await apiFetch<ZoneRef>("/api/zones", {
        method: "POST",
        body: JSON.stringify({ region: form.region, name: newZoneName.trim() }),
      });
      await loadZones(form.region);
      set("zoneId", zone.id);
      setNewZoneOpen(false);
      setNewZoneName("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create zone.");
    } finally {
      setNewZoneSaving(false);
    }
  }

  async function save() {
    if (!valid || saving) return;
    setSaving(true); setError(null);
    try {
      const result = await apiFetch<Station>(
        initial ? `/api/stations/${initial.id}` : "/api/stations",
        {
          method: initial ? "PATCH" : "POST",
          body: JSON.stringify({ ...form, zoneId: form.zoneId || null }),
        }
      );
      // New stations come back without embedded terminal/employee data — normalise
      onSave({
        ...result,
        terminals: result.terminals ?? [],
        counts:    result.counts    ?? { terminalsAsOrigin: 0, employees: 0, posMachines: 0 },
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={initial ? "Edit station" : "New station"} onClose={onClose}>
      <Field label="Station name *">
        <input style={inputCss} value={form.name} onChange={e => set("name", e.target.value)} placeholder="e.g. Meskel Square Terminal" autoFocus />
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Region *">
          <select style={selectCss} value={form.region} onChange={e => { set("region", e.target.value); set("zoneId", ""); }}>
            <option value="">Select…</option>
            {REGIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </Field>
        <Field label="Zone">
          <select style={selectCss} value={form.zoneId} onChange={e => set("zoneId", e.target.value)} disabled={!form.region || zonesLoading}>
            <option value="">{form.region ? "No zone" : "Select a region first"}</option>
            {zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
          </select>
        </Field>
      </div>

      {form.region && (
        newZoneOpen ? (
          <div style={{ display: "flex", gap: 8, marginBottom: 16, marginTop: -8 }}>
            <input style={{ ...inputCss, height: 36, fontSize: 13 }} placeholder="New zone name" value={newZoneName}
              onChange={e => setNewZoneName(e.target.value)} autoFocus
              onKeyDown={e => e.key === "Enter" && createZone()} />
            <button onClick={createZone} disabled={!newZoneName.trim() || newZoneSaving} style={{ height: 36, padding: "0 14px", borderRadius: 8, border: "none", background: "var(--primary)", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
              Add
            </button>
            <button onClick={() => { setNewZoneOpen(false); setNewZoneName(""); }} style={{ height: 36, padding: "0 12px", borderRadius: 8, border: "1.5px solid var(--border)", background: "var(--surface)", fontSize: 12, cursor: "pointer", color: "var(--foreground)" }}>
              Cancel
            </button>
          </div>
        ) : (
          <button onClick={() => setNewZoneOpen(true)} style={{ display: "flex", alignItems: "center", gap: 5, background: "none", border: "none", cursor: "pointer", color: "var(--primary)", fontSize: 12, fontWeight: 600, padding: 0, marginBottom: 16, marginTop: -10 }}>
            <Plus size={13} /> New zone in {regionLabel(form.region)}
          </button>
        )
      )}

      <Field label="Location / address *">
        <input style={inputCss} value={form.location} onChange={e => set("location", e.target.value)} placeholder="Street or landmark" />
      </Field>

      {error && (
        <div style={{ display: "flex", gap: 8, padding: "10px 12px", background: "#fee2e2", borderRadius: 8, marginBottom: 14 }}>
          <AlertCircle size={15} color="#dc2626" style={{ flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontSize: 13, color: "#dc2626" }}>{error}</span>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 4 }}>
        <button onClick={onClose} style={{ height: 40, padding: "0 18px", borderRadius: 10, border: "1.5px solid var(--border)", background: "var(--surface)", fontSize: 14, cursor: "pointer", color: "var(--foreground)" }}>
          Cancel
        </button>
        <button onClick={save} disabled={!valid || saving} style={{ height: 40, padding: "0 22px", borderRadius: 10, border: "none", background: "var(--primary)", color: "#fff", fontSize: 14, fontWeight: 600, cursor: valid && !saving ? "pointer" : "not-allowed", opacity: valid && !saving ? 1 : 0.55, display: "flex", alignItems: "center", gap: 7 }}>
          {saving && <Spinner />}
          {initial ? "Save changes" : "Create station"}
        </button>
      </div>
    </Modal>
  );
}

// ─── Delete confirm modal ─────────────────────────────────────────────────────

function DeleteModal({ name, onConfirm, onClose }: { name: string; onConfirm: () => void; onClose: () => void }) {
  const [deleting, setDeleting] = useState(false);
  async function confirm() {
    setDeleting(true);
    await onConfirm();
    setDeleting(false);
  }
  return (
    <Modal title="Delete station" onClose={onClose}>
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start", marginBottom: 24 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: "#fee2e2", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <AlertCircle size={20} color="#dc2626" />
        </div>
        <p style={{ fontSize: 14, color: "var(--muted-foreground)", lineHeight: 1.6, margin: 0 }}>
          Permanently delete <strong style={{ color: "var(--foreground)" }}>{name}</strong>? All associated terminals will also be removed. This cannot be undone.
        </p>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <button onClick={onClose} style={{ height: 40, padding: "0 18px", borderRadius: 10, border: "1.5px solid var(--border)", background: "var(--surface)", fontSize: 14, cursor: "pointer", color: "var(--foreground)" }}>Cancel</button>
        <button onClick={confirm} disabled={deleting} style={{ height: 40, padding: "0 22px", borderRadius: 10, border: "none", background: "#dc2626", color: "#fff", fontSize: 14, fontWeight: 600, cursor: deleting ? "not-allowed" : "pointer", opacity: deleting ? 0.6 : 1, display: "flex", alignItems: "center", gap: 7 }}>
          {deleting && <Spinner />} Delete station
        </button>
      </div>
    </Modal>
  );
}

// ─── Manage zones modal ───────────────────────────────────────────────────────

function ManageZonesModal({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const [zones, setZones] = useState<ZoneDetail[]>([]);
  const [supervisors, setSupervisors] = useState<SupervisorOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [newRegion, setNewRegion] = useState("");
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const [addingSupervisorTo, setAddingSupervisorTo] = useState<string | null>(null);
  const [supervisorPick, setSupervisorPick] = useState("");

  async function load() {
    setLoading(true); setError(null);
    try {
      const [zonesRes, empRes] = await Promise.all([
        apiFetch<{ data: ZoneDetail[] }>("/api/zones"),
        apiFetch<{ data: SupervisorOption[] }>("/api/employees?role=SUPERVISOR&limit=1000"),
      ]);
      setZones(zonesRes.data);
      setSupervisors(empRes.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load zones.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function createZone() {
    if (!newRegion || !newName.trim() || saving) return;
    setSaving(true); setError(null);
    try {
      await apiFetch("/api/zones", { method: "POST", body: JSON.stringify({ region: newRegion, name: newName.trim() }) });
      setCreating(false); setNewRegion(""); setNewName("");
      await load(); onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create zone.");
    } finally {
      setSaving(false);
    }
  }

  async function renameZone(id: string) {
    if (!renameValue.trim() || saving) return;
    setSaving(true); setError(null);
    try {
      await apiFetch(`/api/zones/${id}`, { method: "PATCH", body: JSON.stringify({ name: renameValue.trim() }) });
      setRenamingId(null); setRenameValue("");
      await load(); onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to rename zone.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteZone(id: string) {
    setSaving(true); setError(null);
    try {
      await apiFetch(`/api/zones/${id}`, { method: "DELETE" });
      await load(); onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete zone.");
    } finally {
      setSaving(false);
    }
  }

  async function addSupervisor(zoneId: string) {
    if (!supervisorPick || saving) return;
    setSaving(true); setError(null);
    try {
      await apiFetch(`/api/zones/${zoneId}/supervisors`, { method: "POST", body: JSON.stringify({ employeeId: supervisorPick }) });
      setAddingSupervisorTo(null); setSupervisorPick("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to assign supervisor.");
    } finally {
      setSaving(false);
    }
  }

  async function removeSupervisor(zoneId: string, employeeId: string) {
    setSaving(true); setError(null);
    try {
      await apiFetch(`/api/zones/${zoneId}/supervisors/${employeeId}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove supervisor.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Manage zones" onClose={onClose}>
      {error && (
        <div style={{ display: "flex", gap: 8, padding: "10px 12px", background: "#fee2e2", borderRadius: 8, marginBottom: 14 }}>
          <AlertCircle size={15} color="#dc2626" style={{ flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontSize: 13, color: "#dc2626" }}>{error}</span>
        </div>
      )}

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 30 }}><Spinner /></div>
      ) : (
        <>
          {zones.length === 0 && <p style={{ fontSize: 13, color: "var(--muted-foreground)", marginBottom: 16 }}>No zones yet.</p>}

          {zones.map(z => (
            <div key={z.id} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "12px 14px", marginBottom: 10, background: "var(--background)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Layers size={14} color="var(--muted-foreground)" style={{ flexShrink: 0 }} />
                {renamingId === z.id ? (
                  <input style={{ ...inputCss, height: 32, fontSize: 13, flex: 1 }} value={renameValue}
                    onChange={e => setRenameValue(e.target.value)} autoFocus
                    onKeyDown={e => e.key === "Enter" && renameZone(z.id)} />
                ) : (
                  <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: "var(--foreground)" }}>{z.name}</span>
                )}
                <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>{regionLabel(z.region)} · {z.stationCount} stations</span>
                {renamingId === z.id ? (
                  <>
                    <button onClick={() => renameZone(z.id)} disabled={saving} style={{ background: "none", border: "none", cursor: "pointer", color: "#16a34a", padding: 4 }}><Check size={14} /></button>
                    <button onClick={() => { setRenamingId(null); setRenameValue(""); }} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", padding: 4 }}><X size={14} /></button>
                  </>
                ) : (
                  <>
                    <button onClick={() => { setRenamingId(z.id); setRenameValue(z.name); }} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", padding: 4 }}><Pencil size={13} /></button>
                    <button onClick={() => deleteZone(z.id)} disabled={saving} style={{ background: "none", border: "none", cursor: "pointer", color: "#dc2626", padding: 4 }}><Trash2 size={13} /></button>
                  </>
                )}
              </div>

              {/* Supervisors */}
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                  <ShieldCheck size={12} color="var(--muted-foreground)" />
                  <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Zone supervisors</span>
                </div>
                {z.supervisors.length === 0 && <p style={{ fontSize: 12, color: "var(--muted-foreground)", margin: "0 0 6px" }}>None assigned.</p>}
                {z.supervisors.map(sup => (
                  <div key={sup.employeeId} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 0" }}>
                    <span style={{ fontSize: 12, color: "var(--foreground)" }}>{sup.name} <span style={{ color: "var(--muted-foreground)" }}>({sup.employeeCode})</span></span>
                    <button onClick={() => removeSupervisor(z.id, sup.employeeId)} disabled={saving} style={{ background: "none", border: "none", cursor: "pointer", color: "#dc2626", fontSize: 11 }}>Remove</button>
                  </div>
                ))}
                {addingSupervisorTo === z.id ? (
                  <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                    <select style={{ ...selectCss, height: 32, fontSize: 12, flex: 1 }} value={supervisorPick} onChange={e => setSupervisorPick(e.target.value)}>
                      <option value="">Select supervisor…</option>
                      {supervisors
                        .filter(s => !z.supervisors.some(sup => sup.employeeId === s.id))
                        .map(s => <option key={s.id} value={s.id}>{s.firstName} {s.lastName} ({s.code})</option>)}
                    </select>
                    <button onClick={() => addSupervisor(z.id)} disabled={!supervisorPick || saving} style={{ height: 32, padding: "0 10px", borderRadius: 7, border: "none", background: "var(--primary)", color: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>Add</button>
                    <button onClick={() => { setAddingSupervisorTo(null); setSupervisorPick(""); }} style={{ height: 32, padding: "0 8px", borderRadius: 7, border: "1.5px solid var(--border)", background: "var(--surface)", fontSize: 11, cursor: "pointer", color: "var(--foreground)" }}>Cancel</button>
                  </div>
                ) : (
                  <button onClick={() => setAddingSupervisorTo(z.id)} style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", color: "var(--primary)", fontSize: 11, fontWeight: 600, padding: 0, marginTop: 4 }}>
                    <UserPlus size={11} /> Add supervisor
                  </button>
                )}
              </div>
            </div>
          ))}

          {creating ? (
            <div style={{ border: "1.5px solid var(--primary)", borderRadius: 10, padding: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                <select style={{ ...selectCss, height: 36, fontSize: 13 }} value={newRegion} onChange={e => setNewRegion(e.target.value)} autoFocus>
                  <option value="">Region…</option>
                  {REGIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
                <input style={{ ...inputCss, height: 36, fontSize: 13 }} placeholder="Zone name" value={newName} onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && createZone()} />
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={createZone} disabled={!newRegion || !newName.trim() || saving} style={{ height: 34, padding: "0 14px", borderRadius: 8, border: "none", background: "var(--primary)", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Create</button>
                <button onClick={() => { setCreating(false); setNewRegion(""); setNewName(""); }} style={{ height: 34, padding: "0 12px", borderRadius: 8, border: "1.5px solid var(--border)", background: "var(--surface)", fontSize: 12, cursor: "pointer", color: "var(--foreground)" }}>Cancel</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setCreating(true)} style={{ display: "flex", alignItems: "center", gap: 6, height: 36, padding: "0 14px", borderRadius: 8, border: "1.5px dashed var(--border)", background: "none", fontSize: 13, color: "var(--primary)", cursor: "pointer", fontWeight: 500 }}>
              <Plus size={15} /> New zone
            </button>
          )}
        </>
      )}
    </Modal>
  );
}

// ─── Terminals tab ────────────────────────────────────────────────────────────

function TerminalsTab({ station, allStations, onTerminalChange }: {
  station: Station;
  allStations: Station[];
  onTerminalChange: () => void; // triggers a reload of the station from API
}) {
  // Local optimistic terminal list — seeded from station prop
  const [terminals, setTerminals] = useState<TerminalRef[]>(station.terminals);
  const [adding,    setAdding]    = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [query,     setQuery]     = useState("");

  const blankForm = {
    name: "", isStation: false, linkedStationId: null as string | null,
    isDeparture: false, isArrival: true,
    distanceKm: 0, roadType: "asphalt" as RoadType,
    asphaltKm: 0, gravelKm: 0,
  };
  const [form, setForm] = useState(blankForm);

  // keep in sync if parent station changes (e.g. after save)
  useEffect(() => { setTerminals(station.terminals); }, [station.terminals]);

  const suggestions = allStations.filter(s =>
    s.id !== station.id &&
    s.name.toLowerCase().includes(query.toLowerCase()) &&
    query.length > 0
  );

  async function saveTerminals(next: TerminalRef[]) {
    setSaving(true);
    try {
      await apiFetch(`/api/stations/${station.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          terminals: next.map(t => ({
            id:              t.id.startsWith("new_") ? undefined : t.id,
            name:            t.name,
            isStation:       t.isStation,
            linkedStationId: t.linkedStationId ?? undefined,
            isDeparture:     t.isDeparture,
            isArrival:       t.isArrival,
            distanceKm:      t.distanceKm,
            roadType:        t.roadType,
            asphaltKm:       t.roadType === "mixed" ? (t.asphaltKm ?? 0) : undefined,
            gravelKm:        t.roadType === "mixed" ? (t.gravelKm  ?? 0) : undefined,
          })),
        }),
      });
      onTerminalChange();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  }

  function addTerminal() {
    if (!form.name.trim()) return;
    const newT: TerminalRef = {
      id:              `new_${Date.now()}`,
      name:            form.name,
      isStation: form.isStation,
      linkedStationId: form.isStation ? form.linkedStationId : null,
      isDeparture:     form.isDeparture,
      isArrival:       form.isArrival,
      distanceKm:      form.distanceKm,
      roadType:        form.roadType,
      asphaltKm:       form.roadType === "mixed" ? form.asphaltKm : null,
      gravelKm:        form.roadType === "mixed" ? form.gravelKm  : null,
    };
    const next = [...terminals, newT];
    setTerminals(next);
    setAdding(false);
    setForm(blankForm);
    setQuery("");
    saveTerminals(next);
  }

  function removeTerminal(id: string) {
    const next = terminals.filter(t => t.id !== id);
    setTerminals(next);
    saveTerminals(next);
  }

  function toggleFlag(id: string, key: "isDeparture" | "isArrival") {
    const next = terminals.map(t => t.id === id ? { ...t, [key]: !t[key] } : t);
    setTerminals(next);
    saveTerminals(next);
  }

  // Road type colours
  const roadColor: Record<RoadType, { bg: string; fg: string }> = {
    asphalt: { bg: "#f1f5f9", fg: "#0f172a" },
    gravel:  { bg: "#fef3c7", fg: "#d97706" },
    mixed:   { bg: "#ede9fe", fg: "#7c3aed" },
  };

  return (
    <div>
      {saving && (
        <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: "var(--muted-foreground)", marginBottom: 12 }}>
          <Spinner /> Saving…
        </div>
      )}

      {terminals.length === 0 && !adding && (
        <p style={{ fontSize: 13, color: "var(--muted-foreground)", marginBottom: 16 }}>No terminals added yet.</p>
      )}

      {terminals.map(t => (
        <div key={t.id} style={{ padding: "12px 14px", borderRadius: 10, border: "1px solid var(--border)", marginBottom: 8, background: "var(--background)" }}>
          {/* Name row */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Navigation size={14} color="var(--muted-foreground)" style={{ flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: "var(--foreground)" }}>{t.name}</span>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
              {t.isStation && <Badge label="Station" color="blue" />}
              <button onClick={() => toggleFlag(t.id, "isDeparture")} style={{ border: "none", cursor: "pointer", borderRadius: 999, padding: "2px 8px", fontSize: 11, fontWeight: 600, background: t.isDeparture ? "#dcfce7" : "#f1f5f9", color: t.isDeparture ? "#16a34a" : "#94a3b8" }}>Departure</button>
              <button onClick={() => toggleFlag(t.id, "isArrival")}   style={{ border: "none", cursor: "pointer", borderRadius: 999, padding: "2px 8px", fontSize: 11, fontWeight: 600, background: t.isArrival  ? "#dbeafe" : "#f1f5f9", color: t.isArrival  ? "#1d4ed8" : "#94a3b8" }}>Arrival</button>
            </div>
            <button onClick={() => removeTerminal(t.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#dc2626", padding: 4, display: "flex", flexShrink: 0 }}>
              <Trash2 size={14} />
            </button>
          </div>
          {/* Distance / road row */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--border)" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--foreground)", fontFamily: "monospace" }}>{Number(t.distanceKm).toFixed(1)} km</span>
            <span style={{ display: "inline-flex", alignItems: "center", padding: "1px 8px", borderRadius: 999, fontSize: 11, fontWeight: 600, background: roadColor[t.roadType].bg, color: roadColor[t.roadType].fg }}>
              {t.roadType.charAt(0).toUpperCase() + t.roadType.slice(1)}
            </span>
            {t.roadType === "mixed" && (
              <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>
                {Number(t.asphaltKm).toFixed(1)} km asphalt · {Number(t.gravelKm).toFixed(1)} km gravel
              </span>
            )}
          </div>
        </div>
      ))}

      {adding ? (
        <div style={{ border: "1.5px solid var(--primary)", borderRadius: 12, padding: 16, marginBottom: 8, background: "var(--surface)" }}>
          {/* Name search */}
          <Field label="Terminal name">
            <div style={{ position: "relative" }}>
              <input style={inputCss} placeholder="Type name or search existing station…" autoFocus
                value={query || form.name}
                onChange={e => { setQuery(e.target.value); setForm(f => ({ ...f, name: e.target.value, isStation: false, linkedStationId: null })); }}
              />
              {suggestions.length > 0 && (
                <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, zIndex: 50, boxShadow: "0 8px 24px rgb(0 0 0/0.1)" }}>
                  {suggestions.map(s => (
                    <button key={s.id} onClick={() => { setForm(f => ({ ...f, name: s.name, isStation: true, linkedStationId: s.id })); setQuery(""); }}
                      style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 14px", border: "none", background: "none", cursor: "pointer", fontSize: 14, color: "var(--foreground)", borderBottom: "1px solid var(--border)" }}>
                      <Building2 size={13} style={{ marginRight: 8, verticalAlign: "middle", color: "var(--primary)" }} />
                      {s.name}
                      <span style={{ fontSize: 11, color: "var(--muted-foreground)", marginLeft: 8 }}>{regionLabel(s.region)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </Field>

          {/* Flags */}
          <div style={{ display: "flex", gap: 20, marginBottom: 14 }}>
            {[["isDeparture","Departure terminal"],["isArrival","Arrival terminal"]].map(([k, label]) => (
              <label key={k} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
                <input type="checkbox" checked={form[k as "isDeparture"|"isArrival"]} onChange={e => setForm(f => ({ ...f, [k]: e.target.checked }))} />
                {label}
              </label>
            ))}
          </div>

          {/* Road type */}
          <Field label="Road type">
            <div style={{ display: "flex", gap: 8 }}>
              {(["asphalt","gravel","mixed"] as RoadType[]).map(rt => {
                const active = form.roadType === rt;
                const c = roadColor[rt];
                return (
                  <button key={rt} onClick={() => setForm(f => ({ ...f, roadType: rt }))}
                    style={{ flex: 1, height: 36, borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700, border: `1.5px solid ${active ? c.fg : "var(--border)"}`, background: active ? c.bg : "var(--surface)", color: active ? c.fg : "var(--muted-foreground)", textTransform: "capitalize", transition: "all 0.12s" }}>
                    {rt}
                  </button>
                );
              })}
            </div>
          </Field>

          {/* Distance inputs */}
          {form.roadType !== "mixed" ? (
            <Field label={`Total distance (km) — ${form.roadType}`}>
              <div style={{ display: "flex", alignItems: "center", border: "1.5px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
                <input type="number" min={0} step={0.1} placeholder="0.0" value={form.distanceKm || ""}
                  onChange={e => setForm(f => ({ ...f, distanceKm: parseFloat(e.target.value) || 0 }))}
                  style={{ flex: 1, height: 42, padding: "0 12px", border: "none", outline: "none", background: "transparent", fontSize: 15, fontWeight: 600, color: "var(--foreground)", fontFamily: "monospace" }} />
                <span style={{ padding: "0 14px", fontSize: 12, fontWeight: 600, color: "var(--muted-foreground)", borderLeft: "1px solid var(--border)", height: "100%", display: "flex", alignItems: "center" }}>km</span>
              </div>
            </Field>
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Field label="Asphalt portion (km)">
                  <div style={{ display: "flex", alignItems: "center", border: "1.5px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
                    <input type="number" min={0} step={0.1} placeholder="0.0" value={form.asphaltKm || ""}
                      onChange={e => { const v = parseFloat(e.target.value)||0; setForm(f => ({ ...f, asphaltKm: v, distanceKm: v + f.gravelKm })); }}
                      style={{ flex: 1, height: 42, padding: "0 10px", border: "none", outline: "none", background: "transparent", fontSize: 14, fontWeight: 600, fontFamily: "monospace", color: "#0f172a" }} />
                    <span style={{ padding: "0 10px", fontSize: 11, fontWeight: 600, color: "var(--muted-foreground)", borderLeft: "1px solid var(--border)", height: "100%", display: "flex", alignItems: "center" }}>km</span>
                  </div>
                </Field>
                <Field label="Gravel portion (km)">
                  <div style={{ display: "flex", alignItems: "center", border: "1.5px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
                    <input type="number" min={0} step={0.1} placeholder="0.0" value={form.gravelKm || ""}
                      onChange={e => { const v = parseFloat(e.target.value)||0; setForm(f => ({ ...f, gravelKm: v, distanceKm: f.asphaltKm + v })); }}
                      style={{ flex: 1, height: 42, padding: "0 10px", border: "none", outline: "none", background: "transparent", fontSize: 14, fontWeight: 600, fontFamily: "monospace", color: "#d97706" }} />
                    <span style={{ padding: "0 10px", fontSize: 11, fontWeight: 600, color: "var(--muted-foreground)", borderLeft: "1px solid var(--border)", height: "100%", display: "flex", alignItems: "center" }}>km</span>
                  </div>
                </Field>
              </div>
              {(form.asphaltKm > 0 || form.gravelKm > 0) && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, padding: "8px 12px", borderRadius: 8, background: "#ede9fe", border: "1px solid #c4b5fd" }}>
                  <span style={{ fontSize: 12, color: "#7c3aed", fontWeight: 500 }}>Total:</span>
                  <span style={{ fontSize: 14, fontWeight: 800, color: "#7c3aed", fontFamily: "monospace" }}>{(form.asphaltKm + form.gravelKm).toFixed(1)} km</span>
                </div>
              )}
            </>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <button onClick={addTerminal} style={{ height: 36, padding: "0 18px", borderRadius: 8, border: "none", background: "var(--primary)", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Add terminal</button>
            <button onClick={() => { setAdding(false); setForm(blankForm); setQuery(""); }} style={{ height: 36, padding: "0 14px", borderRadius: 8, border: "1.5px solid var(--border)", background: "var(--surface)", fontSize: 13, cursor: "pointer", color: "var(--foreground)" }}>Cancel</button>
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

// ─── Detail panel ─────────────────────────────────────────────────────────────

type Tab = "terminals" | "employees" | "pos";

function DetailPanel({ station, allStations, onEdit, onDelete, onReload }: {
  station: Station;
  allStations: Station[];
  onEdit: () => void;
  onDelete: () => void;
  onReload: () => void;
}) {
  const [tab, setTab] = useState<Tab>("terminals");

  function tabBtn(id: Tab, label: string, count: number) {
    const active = tab === id;
    return (
      <button onClick={() => setTab(id)} style={{ height: 36, padding: "0 14px", borderRadius: 8, border: "none", background: active ? "color-mix(in srgb, var(--primary) 10%, transparent)" : "none", color: active ? "var(--primary)" : "var(--muted-foreground)", fontSize: 13, fontWeight: active ? 600 : 400, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
        {label}
        <span style={{ background: active ? "var(--primary)" : "var(--border)", color: active ? "#fff" : "var(--muted-foreground)", borderRadius: 999, padding: "1px 7px", fontSize: 11, fontWeight: 600 }}>{count}</span>
      </button>
    );
  }

  const counts = station.counts;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header */}
      <div style={{ padding: "28px 28px 0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", color: "var(--primary)", textTransform: "uppercase", marginBottom: 4 }}>{station.code}</div>
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
            {regionLabel(station.region)} · {station.zone?.name ?? "No zone"}
          </span>
        </div>

        {/* Stats row */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 20 }}>
          {[
            { label: "Terminals",    value: counts.terminalsAsOrigin, icon: <Navigation size={14} /> },
            { label: "Employees",    value: counts.employees,          icon: <Users size={14} />      },
            { label: "POS machines", value: counts.posMachines,        icon: <Monitor size={14} />    },
          ].map(s => (
            <div key={s.label} style={{ background: "var(--background)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 14px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 5, color: "var(--muted-foreground)", fontSize: 11, marginBottom: 4 }}>{s.icon} {s.label}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: "var(--foreground)" }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Tab bar */}
        <div style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--border)" }}>
          {tabBtn("terminals", "Terminals",    counts.terminalsAsOrigin)}
          {tabBtn("employees", "Employees",    counts.employees)}
          {tabBtn("pos",       "POS Machines", counts.posMachines)}
        </div>
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 28px 28px" }}>
        {tab === "terminals" && (
          <TerminalsTab
            station={station}
            allStations={allStations}
            onTerminalChange={onReload}
          />
        )}
        {tab === "employees" && (
          <div style={{ fontSize: 13, color: "var(--muted-foreground)", padding: "8px 0" }}>
            Employee management is handled on the{" "}
            <a href="/dashboard/employees" style={{ color: "var(--primary)", fontWeight: 600 }}>Employees page</a>.
          </div>
        )}
        {tab === "pos" && (
          <div style={{ fontSize: 13, color: "var(--muted-foreground)", padding: "8px 0" }}>
            POS machine management is handled on the{" "}
            <a href="/dashboard/pos-machines" style={{ color: "var(--primary)", fontWeight: 600 }}>POS Machines page</a>.
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function StationsPage() {
  const [stations,  setStations]  = useState<Station[]>([]);
  const [selected,  setSelected]  = useState<string | null>(null);
  const [search,    setSearch]    = useState("");
  const [loading,   setLoading]   = useState(true);
  const [modal,     setModal]     = useState<"create" | "edit" | "delete" | "zones" | null>(null);
  const [toast,     setToast]     = useState<{ msg: string; type: "success" | "error" } | null>(null);

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const loadStations = useCallback(async (keepSelected = true) => {
    setLoading(true);
    try {
      const res = await apiFetch<{ data: Station[]; meta: { total: number } }>("/api/stations");
      setStations(res.data);
      if (!keepSelected || !selected) {
        setSelected(res.data[0]?.id ?? null);
      }
    } catch (e) {
      setToast({ msg: e instanceof Error ? e.message : "Failed to load stations.", type: "error" });
    } finally {
      setLoading(false);
    }
  }, [selected]);

  useEffect(() => { loadStations(false); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived ────────────────────────────────────────────────────────────────

  const filtered = stations.filter(s => {
    const term = search.toLowerCase();
    return (
      s.name.toLowerCase().includes(term) ||
      regionLabel(s.region).toLowerCase().includes(term) ||
      (s.zone?.name ?? "").toLowerCase().includes(term) ||
      s.code.toLowerCase().includes(term)
    );
  });

  const activeStation = stations.find(s => s.id === selected) ?? null;

  // ── Handlers ───────────────────────────────────────────────────────────────

  function handleSaved(s: Station) {
    setStations(prev => {
      const idx = prev.findIndex(x => x.id === s.id);
      if (idx >= 0) { const n = [...prev]; n[idx] = s; return n; }
      return [s, ...prev];
    });
    setSelected(s.id);
    setToast({ msg: modal === "create" ? `"${s.name}" created` : `"${s.name}" updated`, type: "success" });
    setModal(null);
  }

  async function handleDelete() {
    if (!activeStation) return;
    try {
      await apiFetch(`/api/stations/${activeStation.id}`, { method: "DELETE" });
      const next = stations.filter(s => s.id !== activeStation.id);
      setStations(next);
      setSelected(next[0]?.id ?? null);
      setToast({ msg: `"${activeStation.name}" deleted`, type: "success" });
    } catch (e) {
      setToast({ msg: e instanceof Error ? e.message : "Delete failed.", type: "error" });
    }
    setModal(null);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      <style>{`
        @keyframes fadeUp { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
        @keyframes spin    { to { transform:rotate(360deg); } }
        * { box-sizing:border-box; }
        input[type=number]::-webkit-inner-spin-button { -webkit-appearance:none; }
      `}</style>

      {toast && <Toast message={toast.msg} type={toast.type} onDone={() => setToast(null)} />}

      {modal === "create" && (
        <StationFormModal onSave={handleSaved} onClose={() => setModal(null)} />
      )}
      {modal === "edit" && activeStation && (
        <StationFormModal initial={activeStation} onSave={handleSaved} onClose={() => setModal(null)} />
      )}
      {modal === "delete" && activeStation && (
        <DeleteModal name={activeStation.name} onConfirm={handleDelete} onClose={() => setModal(null)} />
      )}
      {modal === "zones" && (
        <ManageZonesModal onClose={() => setModal(null)} onChanged={() => loadStations(true)} />
      )}

      <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "var(--background)", overflow: "hidden" }}>

        {/* Top bar */}
        <div style={{ padding: "24px 28px 0", flexShrink: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <div>
              <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--foreground)", margin: 0 }}>Stations</h1>
              <p style={{ fontSize: 13, color: "var(--muted-foreground)", margin: "3px 0 0" }}>
                {loading ? "Loading…" : `${stations.length} station${stations.length !== 1 ? "s" : ""} · Manage locations, terminals, staff and POS`}
              </p>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setModal("zones")} style={{ height: 40, padding: "0 16px", borderRadius: 10, border: "1.5px solid var(--border)", background: "var(--surface)", color: "var(--foreground)", fontSize: 14, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 7 }}>
                <Layers size={16} /> Manage zones
              </button>
              <button onClick={() => setModal("create")} style={{ height: 40, padding: "0 18px", borderRadius: 10, border: "none", background: "var(--primary)", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 7 }}>
                <Plus size={16} strokeWidth={2.5} /> New station
              </button>
            </div>
          </div>
        </div>

        {/* Split pane */}
        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "320px 1fr", overflow: "hidden" }}>

          {/* Left — station list */}
          <div style={{ borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--surface)" }}>
            <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
              <div style={{ position: "relative" }}>
                <Search size={14} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "var(--muted-foreground)" }} />
                <input placeholder="Search stations…" value={search} onChange={e => setSearch(e.target.value)}
                  style={{ ...inputCss, paddingLeft: 32, height: 36, fontSize: 13 }} />
              </div>
            </div>

            <div style={{ flex: 1, overflowY: "auto" }}>
              {loading && (
                <div style={{ display: "flex", justifyContent: "center", alignItems: "center", padding: 40 }}><Spinner /></div>
              )}
              {!loading && filtered.length === 0 && (
                <div style={{ padding: 24, textAlign: "center", color: "var(--muted-foreground)", fontSize: 13 }}>
                  {search ? `No stations match "${search}"` : "No stations yet. Create one to get started."}
                </div>
              )}
              {!loading && filtered.map(s => {
                const active = s.id === selected;
                return (
                  <button key={s.id} onClick={() => setSelected(s.id)} style={{ display: "flex", alignItems: "center", width: "100%", textAlign: "left", padding: "14px 16px", border: "none", cursor: "pointer", borderBottom: "1px solid var(--border)", background: active ? "color-mix(in srgb, var(--primary) 7%, transparent)" : "transparent", borderLeft: `3px solid ${active ? "var(--primary)" : "transparent"}`, transition: "background 0.12s" }}>
                    <div style={{ width: 36, height: 36, borderRadius: 9, background: active ? "color-mix(in srgb, var(--primary) 15%, transparent)" : "var(--background)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginRight: 12 }}>
                      <MapPin size={15} color={active ? "var(--primary)" : "var(--muted-foreground)"} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: active ? "var(--primary)" : "var(--foreground)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}</div>
                      <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 1 }}>{regionLabel(s.region)} · {s.zone?.name ?? "No zone"}</div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3, flexShrink: 0 }}>
                      <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>{s.counts.employees} staff</span>
                      <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>{s.counts.terminalsAsOrigin} terminals</span>
                    </div>
                    <ChevronRight size={14} color="var(--muted-foreground)" style={{ marginLeft: 8, flexShrink: 0 }} />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right — detail panel */}
          <div style={{ overflowY: "auto", background: "var(--surface)" }}>
            {loading ? (
              <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100%" }}><Spinner /></div>
            ) : activeStation ? (
              <DetailPanel
                station={activeStation}
                allStations={stations}
                onEdit={() => setModal("edit")}
                onDelete={() => setModal("delete")}
                onReload={() => loadStations(true)}
              />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--muted-foreground)" }}>
                <Building2 size={40} style={{ marginBottom: 12, opacity: 0.3 }} />
                <p style={{ fontSize: 14 }}>Select a station to view details</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}