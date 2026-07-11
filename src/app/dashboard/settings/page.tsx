"use client";

import { useEffect, useState } from "react";
import {
  Users, Shield, Bell, Database, ChevronRight,
  Plus, Pencil, Trash2, X, Check, Clock, Eye, EyeOff,
  AlertCircle, Lock, Unlock, RefreshCw, Search,
  ShieldCheck, ShieldOff, Mail, Phone, Building2,
  ToggleLeft, ToggleRight, KeyRound, UserCog, Info,
  Settings, Globe, Moon, Sun, Save,
} from "lucide-react";
import {
  PERMISSION_PAGES, ADMIN_ROLE_VALUES, ADMIN_ROLE_LABELS, defaultPermissionsForRole,
  type PermissionPage,
} from "@/lib/permissions";

// ─── Types ────────────────────────────────────────────────────────────────────

type AdminRole = (typeof ADMIN_ROLE_VALUES)[number];

type PagePermission = {
  page: PermissionPage;
  canView: boolean;
  canEdit: boolean;
};

type AdminUser = {
  id:            string;
  firstName:     string;
  middleName:    string | null;
  lastName:      string;
  phone:         string;
  companyEmail:  string | null;
  personalEmail: string | null;
  role:          AdminRole;
  isActive:      boolean;
  lockedUntil:   string | null;
  lastLoginAt:   string | null;
  createdAt:     string;
  updatedAt:     string;
  permissions:   PagePermission[];
};

// ─── API helper ───────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.message ?? json?.error ?? `Request failed: ${res.status}`);
  return json as T;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizePhone(v: string) {
  const digits = v.replace(/\D/g, "");
  if (digits.startsWith("09") && digits.length === 10) return `+251${digits.slice(1)}`;
  if (digits.startsWith("07") && digits.length === 10) return `+251${digits.slice(1)}`;
  if (digits.startsWith("251") && digits.length === 12) return `+${digits}`;
  if (v.startsWith("+251")) return v;
  return v;
}

function displayPhone(phone: string) {
  return phone.startsWith("+251") ? `0${phone.slice(4)}` : phone;
}

function fmtDateTime(iso: string | null) {
  if (!iso) return "Never";
  return new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function fullName(u: AdminUser) {
  return [u.firstName, u.middleName, u.lastName].filter(Boolean).join(" ");
}

function initials(u: AdminUser) {
  return (u.firstName.charAt(0) + u.lastName.charAt(0)).toUpperCase();
}

function isLocked(u: AdminUser) {
  return Boolean(u.lockedUntil && new Date(u.lockedUntil) > new Date());
}

// ─── Status styling ───────────────────────────────────────────────────────────

const statusStyle = {
  Active:   { bg: "#dcfce7", fg: "#16a34a", dot: "#16a34a" },
  Inactive: { bg: "#f1f5f9", fg: "#64748b", dot: "#94a3b8" },
  Locked:   { bg: "#fef3c7", fg: "#d97706", dot: "#d97706" },
} as const;

function statusOf(u: AdminUser): keyof typeof statusStyle {
  if (isLocked(u)) return "Locked";
  return u.isActive ? "Active" : "Inactive";
}

const roleStyle: Record<AdminRole, { bg: string; fg: string }> = {
  SUPER_ADMIN: { bg: "#ede9fe", fg: "#7c3aed" },
  ADMIN:       { bg: "#dbeafe", fg: "#1d4ed8" },
  VIEWER:      { bg: "#f1f5f9", fg: "#475569" },
};

// ─── Shared UI ────────────────────────────────────────────────────────────────

const iCss: React.CSSProperties = {
  width: "100%", height: 42, padding: "0 12px",
  border: "1.5px solid var(--border)", borderRadius: 10,
  background: "var(--surface)", color: "var(--foreground)",
  fontSize: 14, outline: "none",
};

function Field({ label, half, children }: { label: string; half?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14, gridColumn: half ? "span 1" : "span 2" }}>
      <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "var(--muted-foreground)", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</label>
      {children}
    </div>
  );
}

function Badge({ label, bg, fg }: { label: string; bg: string; fg: string }) {
  return <span style={{ display: "inline-flex", alignItems: "center", padding: "2px 9px", borderRadius: 999, fontSize: 11, fontWeight: 600, background: bg, color: fg }}>{label}</span>;
}

function Toast({ message, type = "success", onDone }: { message: string; type?: "success" | "error"; onDone: () => void }) {
  useState(() => { const t = setTimeout(onDone, 2600); return () => clearTimeout(t); });
  return (
    <div style={{ position: "fixed", bottom: 28, right: 28, zIndex: 9999, background: "#0f172a", color: "#fff", padding: "12px 20px", borderRadius: 12, fontSize: 14, fontWeight: 500, display: "flex", alignItems: "center", gap: 8, boxShadow: "0 8px 30px rgb(0 0 0/0.18)", animation: "fadeUp 0.2s ease" }}>
      {type === "success" ? <Check size={15} color="#4ade80" strokeWidth={2.5} /> : <AlertCircle size={15} color="#f87171" />}
      {message}
    </div>
  );
}

function Modal({ title, wide, onClose, children }: { title: string; wide?: boolean; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgb(0 0 0/0.4)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: "var(--surface)", borderRadius: 18, width: "100%", maxWidth: wide ? 720 : 520, boxShadow: "0 24px 60px rgb(0 0 0/0.2)", border: "1px solid var(--border)", maxHeight: "92vh", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 24px 0", flexShrink: 0 }}>
          <span style={{ fontSize: 17, fontWeight: 700, color: "var(--foreground)" }}>{title}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", padding: 4 }}><X size={18} /></button>
        </div>
        <div style={{ padding: "20px 24px 24px", overflowY: "auto", flex: 1 }}>{children}</div>
      </div>
    </div>
  );
}

// ─── Settings nav sections ────────────────────────────────────────────────────

type Section = "users" | "system" | "notifications" | "security" | "about";

const NAV: { id: Section; label: string; icon: React.ReactNode; desc: string }[] = [
  { id: "users",         label: "System Users",   icon: <Users size={16} />,    desc: "Manage admin accounts, roles & permissions" },
  { id: "security",      label: "Security",        icon: <Shield size={16} />,   desc: "PIN policies, session & lockout settings"    },
  { id: "system",        label: "System",          icon: <Settings size={16} />, desc: "App name, timezone, appearance"              },
  { id: "notifications", label: "Notifications",   icon: <Bell size={16} />,     desc: "Alert preferences and channels"              },
  { id: "about",         label: "About",           icon: <Info size={16} />,     desc: "Version, licence and build info"             },
];

// ═════════════════════════════════════════════════════════════════════════════
// USER FORM MODAL
// ═════════════════════════════════════════════════════════════════════════════

type FormState = {
  firstName: string; middleName: string; lastName: string;
  phone: string; companyEmail: string; personalEmail: string;
  role: AdminRole; permissions: PagePermission[];
};

function UserFormModal({ initial, onSave, onClose }: {
  initial?: AdminUser; onSave: (form: FormState) => Promise<void>; onClose: () => void;
}) {
  const blank: FormState = {
    firstName: "", middleName: "", lastName: "",
    phone: "", companyEmail: "", personalEmail: "",
    role: "ADMIN", permissions: defaultPermissionsForRole("ADMIN"),
  };
  const [form, setForm] = useState<FormState>(
    initial
      ? {
          firstName: initial.firstName, middleName: initial.middleName ?? "", lastName: initial.lastName,
          phone: displayPhone(initial.phone), companyEmail: initial.companyEmail ?? "", personalEmail: initial.personalEmail ?? "",
          role: initial.role, permissions: initial.permissions,
        }
      : blank
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm(f => ({ ...f, [k]: v }));

  function handleRoleChange(role: AdminRole) {
    // Reset permissions to role defaults, but keep any manual overrides if editing
    setForm(f => ({ ...f, role, permissions: initial ? f.permissions : defaultPermissionsForRole(role) }));
  }

  function togglePerm(page: string, type: "canView" | "canEdit") {
    setForm(f => ({
      ...f,
      permissions: f.permissions.map(p =>
        p.page === page
          ? type === "canView"
            ? { ...p, canView: !p.canView, canEdit: !p.canView ? p.canEdit : false }
            : { ...p, canEdit: !p.canEdit, canView: !p.canEdit ? true : p.canView }
          : p
      ),
    }));
  }

  const valid = form.firstName.trim() && form.lastName.trim() && form.phone.trim();

  async function save() {
    if (!valid || saving) return;
    setSaving(true); setError(null);
    try {
      await onSave(form);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save user.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={initial ? "Edit admin user" : "New admin user"} wide onClose={onClose}>
      {error && (
        <div style={{ display: "flex", gap: 8, padding: "10px 12px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, marginBottom: 16 }}>
          <AlertCircle size={15} color="#dc2626" style={{ flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontSize: 13, color: "#dc2626" }}>{error}</span>
        </div>
      )}

      {/* ── Profile fields ── */}
      <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--muted-foreground)", marginBottom: 12 }}>Profile</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 14px" }}>
        <Field label="First name *" half><input style={iCss} value={form.firstName} onChange={e => set("firstName", e.target.value)} autoFocus /></Field>
        <Field label="Middle name"  half><input style={iCss} value={form.middleName} onChange={e => set("middleName", e.target.value)} /></Field>
        <Field label="Last name *"  half><input style={iCss} value={form.lastName}   onChange={e => set("lastName", e.target.value)} /></Field>
        <Field label="Phone *"      half><input style={iCss} value={form.phone}       onChange={e => set("phone", e.target.value)} placeholder="09XXXXXXXX" /></Field>
        <Field label="Company email" half><input style={iCss} value={form.companyEmail}  onChange={e => set("companyEmail", e.target.value)}  placeholder="name@bstechdigital.com" /></Field>
        <Field label="Personal email"  half><input style={iCss} value={form.personalEmail} onChange={e => set("personalEmail", e.target.value)} placeholder="name@gmail.com" /></Field>
      </div>

      {/* ── Role ── */}
      <div style={{ borderTop: "1px solid var(--border)", margin: "6px 0 16px" }} />
      <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--muted-foreground)", marginBottom: 12 }}>Role</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 14px" }}>
        <Field label="Role *" half>
          <select style={{ ...iCss, cursor: "pointer" }} value={form.role} onChange={e => handleRoleChange(e.target.value as AdminRole)}>
            {ADMIN_ROLE_VALUES.map(r => <option key={r} value={r}>{ADMIN_ROLE_LABELS[r]}</option>)}
          </select>
        </Field>
      </div>

      {/* ── Page permissions ── */}
      <div style={{ borderTop: "1px solid var(--border)", margin: "6px 0 16px" }} />
      <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--muted-foreground)", marginBottom: 12 }}>Page permissions</p>
      <div style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden", marginBottom: 14 }}>
        {/* Header */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 90px 90px", background: "var(--background)", padding: "8px 14px", borderBottom: "1px solid var(--border)" }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Page</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted-foreground)", textAlign: "center", textTransform: "uppercase", letterSpacing: "0.05em" }}>View</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted-foreground)", textAlign: "center", textTransform: "uppercase", letterSpacing: "0.05em" }}>Edit</span>
        </div>
        {form.permissions.map((perm, i) => (
          <div key={perm.page} style={{ display: "grid", gridTemplateColumns: "1fr 90px 90px", alignItems: "center", padding: "10px 14px", borderBottom: i < form.permissions.length - 1 ? "1px solid var(--border)" : "none", background: "var(--surface)" }}>
            <span style={{ fontSize: 13, color: "var(--foreground)", fontWeight: 500 }}>{PERMISSION_PAGES.find(p => p.page === perm.page)?.label ?? perm.page}</span>
            {/* View toggle */}
            <div style={{ display: "flex", justifyContent: "center" }}>
              <button onClick={() => togglePerm(perm.page, "canView")}
                style={{ background: "none", border: "none", cursor: perm.page === "settings" && form.role !== "SUPER_ADMIN" ? "not-allowed" : "pointer", opacity: perm.page === "settings" && form.role !== "SUPER_ADMIN" ? 0.3 : 1, color: perm.canView ? "#16a34a" : "#e2e8f0" }}>
                {perm.canView ? <ToggleRight size={24} color="#16a34a" /> : <ToggleLeft size={24} color="#cbd5e1" />}
              </button>
            </div>
            {/* Edit toggle */}
            <div style={{ display: "flex", justifyContent: "center" }}>
              <button onClick={() => togglePerm(perm.page, "canEdit")}
                style={{ background: "none", border: "none", cursor: !perm.canView ? "not-allowed" : "pointer", opacity: !perm.canView ? 0.3 : 1 }}>
                {perm.canEdit ? <ToggleRight size={24} color="#2563eb" /> : <ToggleLeft size={24} color="#cbd5e1" />}
              </button>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <button onClick={onClose} style={{ height: 40, padding: "0 18px", borderRadius: 10, border: "1.5px solid var(--border)", background: "var(--surface)", fontSize: 14, cursor: "pointer", color: "var(--foreground)" }}>Cancel</button>
        <button onClick={save} disabled={!valid || saving} style={{ height: 40, padding: "0 22px", borderRadius: 10, border: "none", background: "var(--primary)", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", opacity: valid && !saving ? 1 : 0.5 }}>
          {saving ? "Saving…" : initial ? "Save changes" : "Create user"}
        </button>
      </div>
    </Modal>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// DELETE MODAL
// ═════════════════════════════════════════════════════════════════════════════

function DeleteModal({ user, onConfirm, onClose }: {
  user: AdminUser; onConfirm: () => void; onClose: () => void;
}) {
  return (
    <Modal title="Remove admin user" onClose={onClose}>
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start", marginBottom: 24 }}>
        <div style={{ width: 42, height: 42, borderRadius: 10, background: "#fee2e2", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <AlertCircle size={20} color="#dc2626" />
        </div>
        <p style={{ fontSize: 14, color: "var(--muted-foreground)", lineHeight: 1.6, margin: 0 }}>
          Permanently remove <strong style={{ color: "var(--foreground)" }}>{fullName(user)}</strong> ({displayPhone(user.phone)}) from the system? They will immediately lose all access. This cannot be undone.
        </p>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <button onClick={onClose} style={{ height: 40, padding: "0 18px", borderRadius: 10, border: "1.5px solid var(--border)", background: "var(--surface)", fontSize: 14, cursor: "pointer", color: "var(--foreground)" }}>Cancel</button>
        <button onClick={onConfirm} style={{ height: 40, padding: "0 22px", borderRadius: 10, border: "none", background: "#dc2626", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Remove user</button>
      </div>
    </Modal>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// USER DETAIL PANEL
// ═════════════════════════════════════════════════════════════════════════════

function UserDetail({ user, isSelf, onEdit, onDelete, onToggleActive }: {
  user: AdminUser;
  isSelf: boolean;
  onEdit: () => void; onDelete: () => void;
  onToggleActive: () => void;
}) {
  const [tab, setTab] = useState<"profile" | "permissions">("profile");
  const status = statusOf(user);
  const ss = statusStyle[status];
  const rs = roleStyle[user.role];

  function TabBtn({ id, label }: { id: "profile" | "permissions"; label: string }) {
    const active = tab === id;
    return (
      <button onClick={() => setTab(id)} style={{ height: 34, padding: "0 14px", borderRadius: 8, border: "none", background: active ? "color-mix(in srgb, var(--primary) 10%, transparent)" : "none", color: active ? "var(--primary)" : "var(--muted-foreground)", fontSize: 13, fontWeight: active ? 700 : 500, cursor: "pointer" }}>
        {label}
      </button>
    );
  }

  function InfoRow({ icon, label, value, mono }: { icon?: React.ReactNode; label: string; value: string | null; mono?: boolean }) {
    return (
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: "var(--muted-foreground)", fontWeight: 500 }}>
          {icon}<span>{label}</span>
        </div>
        <span style={{ fontSize: 13, color: "var(--foreground)", fontWeight: 500, fontFamily: mono ? "monospace" : "inherit" }}>{value || "—"}</span>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header */}
      <div style={{ padding: "28px 28px 0", flexShrink: 0 }}>
        <div style={{ display: "flex", gap: 16, alignItems: "flex-start", marginBottom: 16 }}>
          {/* Avatar */}
          <div style={{ width: 54, height: 54, borderRadius: 15, background: rs.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, border: `2px solid ${rs.fg}22` }}>
            <span style={{ fontSize: 18, fontWeight: 800, color: rs.fg }}>{initials(user)}</span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ fontSize: 19, fontWeight: 700, color: "var(--foreground)", margin: 0 }}>{fullName(user)}{isSelf ? " (you)" : ""}</h2>
            <div style={{ display: "flex", gap: 6, marginTop: 7, flexWrap: "wrap" }}>
              <Badge label={ADMIN_ROLE_LABELS[user.role]} bg={rs.bg} fg={rs.fg} />
              <Badge label={status} bg={ss.bg} fg={ss.fg} />
            </div>
          </div>
          {/* Action buttons */}
          <div style={{ display: "flex", gap: 7, flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <button onClick={onEdit} style={{ height: 34, padding: "0 12px", borderRadius: 8, border: "1.5px solid var(--border)", background: "var(--surface)", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 5, color: "var(--foreground)", fontWeight: 600 }}>
              <Pencil size={12} /> Edit
            </button>
            {!isSelf && (
              <>
                <button onClick={onToggleActive} style={{ height: 34, padding: "0 12px", borderRadius: 8, border: `1.5px solid ${user.isActive ? "#fecaca" : "#bbf7d0"}`, background: user.isActive ? "#fff5f5" : "#f0fdf4", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 5, color: user.isActive ? "#dc2626" : "#16a34a", fontWeight: 600 }}>
                  {user.isActive ? <Lock size={12} /> : <Unlock size={12} />}
                  {user.isActive ? "Deactivate" : "Activate"}
                </button>
                <button onClick={onDelete} style={{ height: 34, padding: "0 12px", borderRadius: 8, border: "1.5px solid #fecaca", background: "#fff5f5", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 5, color: "#dc2626", fontWeight: 600 }}>
                  <Trash2 size={12} /> Remove
                </button>
              </>
            )}
          </div>
        </div>

        {/* Quick info strip */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 18 }}>
          {[
            { label: "Last login",  value: fmtDateTime(user.lastLoginAt), color: "#2563eb" },
            { label: "Created",     value: fmtDate(user.createdAt),       color: "#16a34a" },
            { label: "Page access", value: `${user.permissions.filter(p => p.canView).length} of ${PERMISSION_PAGES.length} pages`, color: "#7c3aed" },
          ].map(s => (
            <div key={s.label} style={{ background: "var(--background)", border: "1px solid var(--border)", borderRadius: 9, padding: "9px 12px" }}>
              <div style={{ fontSize: 10, color: "var(--muted-foreground)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 3 }}>{s.label}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 2, borderBottom: "1px solid var(--border)" }}>
          <TabBtn id="profile"     label="Profile"      />
          <TabBtn id="permissions" label="Permissions"  />
        </div>
      </div>

      {/* Tab body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 28px 28px" }}>

        {tab === "profile" && (
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--muted-foreground)", marginBottom: 4 }}>Contact</p>
            <InfoRow icon={<Phone size={12} />}    label="Phone"          value={displayPhone(user.phone)} mono />
            <InfoRow icon={<Mail size={12} />}     label="Company email"  value={user.companyEmail}       />
            <InfoRow icon={<Globe size={12} />}    label="Personal email" value={user.personalEmail}      />

            <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--muted-foreground)", marginBottom: 4, marginTop: 20 }}>Account</p>
            <InfoRow icon={<UserCog size={12} />}  label="Role"           value={ADMIN_ROLE_LABELS[user.role]} />
            <InfoRow icon={<ShieldCheck size={12}/>}label="Status"        value={status}             />
            <InfoRow icon={<Clock size={12} />}    label="Last login"     value={fmtDateTime(user.lastLoginAt)} />
            <InfoRow icon={<Database size={12} />} label="Account created" value={fmtDate(user.createdAt)} />

            {!user.isActive && (
              <div style={{ marginTop: 16, display: "flex", gap: 10, padding: "12px 14px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10 }}>
                <ShieldOff size={16} color="#dc2626" style={{ flexShrink: 0 }} />
                <p style={{ fontSize: 12, color: "#dc2626", margin: 0, lineHeight: 1.6 }}>
                  This account is <strong>deactivated</strong>. The user cannot log in until an admin reactivates it.
                </p>
              </div>
            )}
            {isLocked(user) && (
              <div style={{ marginTop: 16, display: "flex", gap: 10, padding: "12px 14px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10 }}>
                <Lock size={16} color="#d97706" style={{ flexShrink: 0 }} />
                <p style={{ fontSize: 12, color: "#d97706", margin: 0, lineHeight: 1.6 }}>
                  Temporarily locked from too many failed OTP attempts, until {fmtDateTime(user.lockedUntil)}.
                </p>
              </div>
            )}
          </div>
        )}

        {tab === "permissions" && (
          <div>
            <p style={{ fontSize: 13, color: "var(--muted-foreground)", marginBottom: 16, lineHeight: 1.6 }}>
              Permissions control which pages this user can access. <strong style={{ color: "var(--foreground)" }}>View</strong> allows read-only access. <strong style={{ color: "var(--foreground)" }}>Edit</strong> allows creating, updating and deleting records.
            </p>
            <div style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 80px", background: "var(--background)", padding: "9px 14px", borderBottom: "1px solid var(--border)" }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Page</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted-foreground)", textAlign: "center", textTransform: "uppercase", letterSpacing: "0.05em" }}>View</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted-foreground)", textAlign: "center", textTransform: "uppercase", letterSpacing: "0.05em" }}>Edit</span>
              </div>
              {user.permissions.map((perm, i) => (
                <div key={perm.page} style={{ display: "grid", gridTemplateColumns: "1fr 80px 80px", alignItems: "center", padding: "11px 14px", borderBottom: i < user.permissions.length - 1 ? "1px solid var(--border)" : "none", background: "var(--surface)" }}>
                  <span style={{ fontSize: 13, color: "var(--foreground)", fontWeight: 500 }}>{PERMISSION_PAGES.find(p => p.page === perm.page)?.label ?? perm.page}</span>
                  <div style={{ display: "flex", justifyContent: "center" }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: perm.canView ? "#16a34a" : "#94a3b8", background: perm.canView ? "#dcfce7" : "#f1f5f9", padding: "2px 8px", borderRadius: 999 }}>
                      {perm.canView ? "Yes" : "No"}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "center" }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: perm.canEdit ? "#2563eb" : "#94a3b8", background: perm.canEdit ? "#dbeafe" : "#f1f5f9", padding: "2px 8px", borderRadius: 999 }}>
                      {perm.canEdit ? "Yes" : "No"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// SECURITY SECTION
// ═════════════════════════════════════════════════════════════════════════════

function SecuritySection() {
  const [pinLen,      setPinLen]      = useState(6);
  const [maxAttempts, setMaxAttempts] = useState(3);
  const [lockMins,    setLockMins]    = useState(15);
  const [sessionHrs,  setSessionHrs]  = useState(8);
  const [otpExpMins,  setOtpExpMins]  = useState(5);
  const [saved, setSaved] = useState(false);

  function save() { setSaved(true); setTimeout(() => setSaved(false), 2200); }

  function Row({ label, desc, children }: { label: string; desc: string; children: React.ReactNode }) {
    return (
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 0", borderBottom: "1px solid var(--border)" }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--foreground)" }}>{label}</div>
          <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 2 }}>{desc}</div>
        </div>
        {children}
      </div>
    );
  }

  const numInput = (val: number, set: (n: number) => void, min: number, max: number, suffix: string) => (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <input type="number" min={min} max={max} value={val} onChange={e => set(Number(e.target.value))}
        style={{ width: 70, height: 36, padding: "0 10px", border: "1.5px solid var(--border)", borderRadius: 8, fontSize: 14, fontWeight: 700, fontFamily: "monospace", outline: "none", color: "var(--foreground)", background: "var(--surface)", textAlign: "center" }} />
      <span style={{ fontSize: 12, color: "var(--muted-foreground)", fontWeight: 500 }}>{suffix}</span>
    </div>
  );

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--foreground)", margin: "0 0 4px" }}>PIN policy</h3>
        <p style={{ fontSize: 12, color: "var(--muted-foreground)", margin: 0 }}>Rules applied when users set or enter their PIN</p>
      </div>
      <Row label="PIN length"       desc="Number of digits required for a valid PIN">       {numInput(pinLen, setPinLen, 4, 8, "digits")} </Row>
      <Row label="Max failed attempts" desc="Lock account after this many wrong PIN entries">{numInput(maxAttempts, setMaxAttempts, 1, 10, "attempts")} </Row>
      <Row label="Lockout duration" desc="How long an account stays locked after too many failures">{numInput(lockMins, setLockMins, 1, 60, "minutes")} </Row>

      <div style={{ marginTop: 28, marginBottom: 24 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--foreground)", margin: "0 0 4px" }}>Sessions & OTP</h3>
        <p style={{ fontSize: 12, color: "var(--muted-foreground)", margin: 0 }}>Login session and one-time-password settings</p>
      </div>
      <Row label="Session duration"  desc="Auto sign-out after this period of inactivity">    {numInput(sessionHrs, setSessionHrs, 1, 24, "hours")} </Row>
      <Row label="OTP expiry"        desc="SMS one-time-password validity window">            {numInput(otpExpMins, setOtpExpMins, 2, 15, "minutes")} </Row>

      <div style={{ marginTop: 24, display: "flex", justifyContent: "flex-end" }}>
        <button onClick={save} style={{ height: 40, padding: "0 22px", borderRadius: 10, border: "none", background: saved ? "#16a34a" : "var(--primary)", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 7, transition: "background 0.2s" }}>
          {saved ? <><Check size={14} /> Saved</> : <><Save size={14} /> Save security settings</>}
        </button>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// SYSTEM SECTION
// ═════════════════════════════════════════════════════════════════════════════

function SystemSection() {
  const [appName,   setAppName]   = useState("OroDashboard");
  const [company,   setCompany]   = useState("BS Tech Digital");
  const [timezone,  setTimezone]  = useState("Africa/Addis_Ababa");
  const [currency,  setCurrency]  = useState("ETB");
  const [dateFormat,setDateFormat]= useState("DD/MM/YYYY");
  const [darkMode,  setDarkMode]  = useState(false);
  const [saved, setSaved] = useState(false);

  function save() { setSaved(true); setTimeout(() => setSaved(false), 2200); }

  function Row({ label, desc, children }: { label: string; desc: string; children: React.ReactNode }) {
    return (
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "15px 0", borderBottom: "1px solid var(--border)" }}>
        <div style={{ flex: 1, marginRight: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--foreground)" }}>{label}</div>
          <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 2 }}>{desc}</div>
        </div>
        <div style={{ flexShrink: 0 }}>{children}</div>
      </div>
    );
  }

  const sInput = (val: string, set: (s: string) => void, placeholder?: string) => (
    <input value={val} onChange={e => set(e.target.value)} placeholder={placeholder}
      style={{ width: 220, height: 36, padding: "0 11px", border: "1.5px solid var(--border)", borderRadius: 8, fontSize: 13, outline: "none", color: "var(--foreground)", background: "var(--surface)" }} />
  );

  const sSelect = (val: string, set: (s: string) => void, opts: string[]) => (
    <select value={val} onChange={e => set(e.target.value)}
      style={{ width: 220, height: 36, padding: "0 11px", border: "1.5px solid var(--border)", borderRadius: 8, fontSize: 13, outline: "none", color: "var(--foreground)", background: "var(--surface)", cursor: "pointer" }}>
      {opts.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--foreground)", margin: "0 0 4px" }}>Identity</h3>
        <p style={{ fontSize: 12, color: "var(--muted-foreground)", margin: 0 }}>How the app presents itself</p>
      </div>
      <Row label="App name"    desc="Displayed in the header and browser tab">{sInput(appName,  setAppName,  "App name")}</Row>
      <Row label="Company name" desc="Shown in footers and PDF report headers">{sInput(company,  setCompany,  "Company name")}</Row>

      <div style={{ marginTop: 28, marginBottom: 24 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--foreground)", margin: "0 0 4px" }}>Locale & format</h3>
        <p style={{ fontSize: 12, color: "var(--muted-foreground)", margin: 0 }}>Regional display settings</p>
      </div>
      <Row label="Timezone"    desc="Used for all timestamps and date displays">  {sSelect(timezone,  setTimezone,  ["Africa/Addis_Ababa", "UTC", "Europe/London", "America/New_York"])}</Row>
      <Row label="Currency"    desc="Default currency for fare and salary display">{sSelect(currency,  setCurrency,  ["ETB", "USD", "EUR"])}</Row>
      <Row label="Date format" desc="How dates are displayed across the system">  {sSelect(dateFormat,setDateFormat,["DD/MM/YYYY","MM/DD/YYYY","YYYY-MM-DD"])}</Row>

      <div style={{ marginTop: 28, marginBottom: 24 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--foreground)", margin: "0 0 4px" }}>Appearance</h3>
        <p style={{ fontSize: 12, color: "var(--muted-foreground)", margin: 0 }}>Theme and display preferences</p>
      </div>
      <Row label="Dark mode" desc="Switch the dashboard to a dark colour scheme">
        <button onClick={() => setDarkMode(v => !v)} style={{ display: "flex", alignItems: "center", gap: 8, height: 36, padding: "0 14px", borderRadius: 8, border: "1.5px solid var(--border)", background: "var(--surface)", cursor: "pointer", fontSize: 13, fontWeight: 600, color: darkMode ? "#f8fafc" : "var(--foreground)" }}>
          {darkMode ? <Moon size={14} /> : <Sun size={14} />}
          {darkMode ? "Dark" : "Light"}
        </button>
      </Row>

      <div style={{ marginTop: 24, display: "flex", justifyContent: "flex-end" }}>
        <button onClick={save} style={{ height: 40, padding: "0 22px", borderRadius: 10, border: "none", background: saved ? "#16a34a" : "var(--primary)", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 7, transition: "background 0.2s" }}>
          {saved ? <><Check size={14} /> Saved</> : <><Save size={14} /> Save system settings</>}
        </button>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// NOTIFICATIONS SECTION
// ═════════════════════════════════════════════════════════════════════════════

function NotificationsSection() {
  const [settings, setSettings] = useState([
    { id: "pos_outdated",   label: "Outdated POS app version",       desc: "Alert when a POS machine is not on the latest app version", enabled: true  },
    { id: "pos_unassigned", label: "Unassigned POS machines",        desc: "Alert when an active POS has no operator assigned",         enabled: true  },
    { id: "station_no_staff",label: "Station with no staff",         desc: "Alert when a station has zero employees assigned",           enabled: true  },
    { id: "failed_logins",  label: "Failed login alerts",            desc: "Notify when an account is locked after failed PIN attempts", enabled: true  },
    { id: "petty_cash_high",label: "High petty cash disbursement",   desc: "Alert when a single disbursement exceeds a threshold",      enabled: false },
    { id: "new_user_login", label: "New user first login",           desc: "Notify when a new admin logs in for the first time",        enabled: false },
  ]);
  const [saved, setSaved] = useState(false);

  function toggle(id: string) { setSettings(prev => prev.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s)); }
  function save() { setSaved(true); setTimeout(() => setSaved(false), 2200); }

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--foreground)", margin: "0 0 4px" }}>Dashboard alerts</h3>
        <p style={{ fontSize: 12, color: "var(--muted-foreground)", margin: 0 }}>Control which issues are surfaced in the dashboard alert banner</p>
      </div>
      {settings.map((s, i) => (
        <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 0", borderBottom: i < settings.length - 1 ? "1px solid var(--border)" : "none" }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--foreground)" }}>{s.label}</div>
            <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 2 }}>{s.desc}</div>
          </div>
          <button onClick={() => toggle(s.id)} style={{ background: "none", border: "none", cursor: "pointer", flexShrink: 0, marginLeft: 20, color: s.enabled ? "#16a34a" : "#cbd5e1" }}>
            {s.enabled ? <ToggleRight size={28} color="#16a34a" /> : <ToggleLeft size={28} color="#cbd5e1" />}
          </button>
        </div>
      ))}
      <div style={{ marginTop: 24, display: "flex", justifyContent: "flex-end" }}>
        <button onClick={save} style={{ height: 40, padding: "0 22px", borderRadius: 10, border: "none", background: saved ? "#16a34a" : "var(--primary)", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 7, transition: "background 0.2s" }}>
          {saved ? <><Check size={14} /> Saved</> : <><Save size={14} /> Save preferences</>}
        </button>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// ABOUT SECTION
// ═════════════════════════════════════════════════════════════════════════════

function AboutSection() {
  const rows = [
    { label: "Application",     value: "OroDashboard" },
    { label: "Version",         value: "v1.0.0-beta" },
    { label: "Build",           value: "2025-06-27" },
    { label: "Framework",       value: "Next.js 16 · TypeScript · Prisma 7" },
    { label: "Database",        value: "PostgreSQL (Supabase)" },
    { label: "Developed by",    value: "BS Tech Digital" },
    { label: "Contact",         value: "dev@bstechdigital.com" },
    { label: "Licence",         value: "Proprietary — all rights reserved" },
  ];
  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--foreground)", margin: "0 0 4px" }}>System information</h3>
        <p style={{ fontSize: 12, color: "var(--muted-foreground)", margin: 0 }}>Build details and licence information</p>
      </div>
      <div style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
        {rows.map((r, i) => (
          <div key={r.label} style={{ display: "flex", padding: "12px 16px", borderBottom: i < rows.length - 1 ? "1px solid var(--border)" : "none", background: i % 2 === 0 ? "var(--surface)" : "var(--background)" }}>
            <span style={{ width: 160, fontSize: 12, fontWeight: 600, color: "var(--muted-foreground)", flexShrink: 0 }}>{r.label}</span>
            <span style={{ fontSize: 13, color: "var(--foreground)", fontFamily: r.label === "Version" || r.label === "Build" ? "monospace" : "inherit" }}>{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// USERS SECTION (split pane)
// ═════════════════════════════════════════════════════════════════════════════

function UsersSection() {
  const [users,         setUsers]         = useState<AdminUser[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [selected,      setSelected]      = useState<string | null>(null);
  const [search,        setSearch]        = useState("");
  const [modal,         setModal]         = useState<"create" | "edit" | "delete" | null>(null);
  const [toast,         setToast]         = useState<{ message: string; type?: "success" | "error" } | null>(null);
  const [loading,       setLoading]       = useState(true);
  const [loadError,     setLoadError]     = useState<string | null>(null);

  async function load() {
    setLoading(true); setLoadError(null);
    try {
      const [me, list] = await Promise.all([
        apiFetch<{ id: string }>("/api/auth/me"),
        apiFetch<{ data: AdminUser[] }>("/api/settings/admin-users"),
      ]);
      setCurrentUserId(me.id);
      setUsers(list.data);
      setSelected(prev => prev ?? list.data[0]?.id ?? null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load admin users.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const filtered = users.filter(u => {
    const term = search.toLowerCase();
    return fullName(u).toLowerCase().includes(term) || u.phone.includes(term) ||
      (u.companyEmail ?? "").toLowerCase().includes(term) || ADMIN_ROLE_LABELS[u.role].toLowerCase().includes(term);
  });

  const active = users.find(u => u.id === selected) ?? null;

  async function createUser(form: FormState) {
    const created = await apiFetch<AdminUser>("/api/settings/admin-users", {
      method: "POST",
      body: JSON.stringify({
        firstName: form.firstName.trim(),
        middleName: form.middleName.trim() || undefined,
        lastName: form.lastName.trim(),
        phone: normalizePhone(form.phone),
        companyEmail: form.companyEmail.trim() || undefined,
        personalEmail: form.personalEmail.trim() || undefined,
        role: form.role,
        permissions: form.permissions,
      }),
    });
    setUsers(prev => [...prev, created]);
    setSelected(created.id);
    setToast({ message: `${created.firstName} ${created.lastName} added` });
    setModal(null);
  }

  async function updateUser(form: FormState) {
    if (!active) return;
    const updated = await apiFetch<AdminUser>(`/api/settings/admin-users/${active.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        firstName: form.firstName.trim(),
        middleName: form.middleName.trim() || null,
        lastName: form.lastName.trim(),
        phone: normalizePhone(form.phone),
        companyEmail: form.companyEmail.trim() || null,
        personalEmail: form.personalEmail.trim() || null,
        role: form.role,
        permissions: form.permissions,
      }),
    });
    setUsers(prev => prev.map(u => u.id === updated.id ? updated : u));
    setToast({ message: `${updated.firstName} ${updated.lastName} updated` });
    setModal(null);
  }

  async function deleteUser() {
    if (!active) return;
    try {
      await apiFetch(`/api/settings/admin-users/${active.id}`, { method: "DELETE" });
      setUsers(prev => prev.filter(u => u.id !== active.id));
      setSelected(users.find(u => u.id !== active.id)?.id ?? null);
      setToast({ message: `${fullName(active)} removed` });
    } catch (e) {
      setToast({ message: e instanceof Error ? e.message : "Failed to remove user.", type: "error" });
    } finally {
      setModal(null);
    }
  }

  async function toggleActive() {
    if (!active) return;
    try {
      const updated = await apiFetch<AdminUser>(`/api/settings/admin-users/${active.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !active.isActive }),
      });
      setUsers(prev => prev.map(u => u.id === updated.id ? updated : u));
      setToast({ message: `${fullName(updated)} ${updated.isActive ? "activated" : "deactivated"}` });
    } catch (e) {
      setToast({ message: e instanceof Error ? e.message : "Failed to update status.", type: "error" });
    }
  }

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--muted-foreground)" }}>
        <RefreshCw size={18} style={{ marginRight: 8, animation: "spin 1s linear infinite" }} /> Loading admin users…
      </div>
    );
  }

  if (loadError) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 10 }}>
        <AlertCircle size={28} color="#dc2626" />
        <p style={{ fontSize: 13, color: "#dc2626" }}>{loadError}</p>
        <button onClick={load} style={{ height: 34, padding: "0 14px", borderRadius: 8, border: "1.5px solid var(--border)", background: "var(--surface)", cursor: "pointer", fontSize: 12, fontWeight: 600, color: "var(--foreground)", display: "flex", alignItems: "center", gap: 6 }}>
          <RefreshCw size={13} /> Retry
        </button>
      </div>
    );
  }

  return (
    <>
      {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}
      {modal === "create" && <UserFormModal onSave={createUser} onClose={() => setModal(null)} />}
      {modal === "edit"   && active && <UserFormModal initial={active} onSave={updateUser} onClose={() => setModal(null)} />}
      {modal === "delete" && active && <DeleteModal user={active} onConfirm={deleteUser} onClose={() => setModal(null)} />}

      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", height: "100%", overflow: "hidden", borderRadius: 14, border: "1px solid var(--border)" }}>
        {/* Left list */}
        <div style={{ borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--surface)" }}>
          <div style={{ padding: "12px 12px 8px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
            <div style={{ position: "relative", marginBottom: 8 }}>
              <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--muted-foreground)" }} />
              <input placeholder="Search users…" value={search} onChange={e => setSearch(e.target.value)}
                style={{ ...iCss, paddingLeft: 30, height: 34, fontSize: 12 }} />
            </div>
            <button onClick={() => setModal("create")} style={{ width: "100%", height: 34, borderRadius: 8, border: "none", background: "var(--primary)", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
              <Plus size={14} /> New admin user
            </button>
          </div>
          <div style={{ flex: 1, overflowY: "auto" }}>
            {filtered.length === 0 && (
              <p style={{ padding: 16, fontSize: 12, color: "var(--muted-foreground)", textAlign: "center" }}>No users match your search.</p>
            )}
            {filtered.map(u => {
              const isActiveRow = u.id === selected;
              const rs = roleStyle[u.role];
              const ss = statusStyle[statusOf(u)];
              return (
                <button key={u.id} onClick={() => setSelected(u.id)} style={{ display: "flex", alignItems: "center", width: "100%", textAlign: "left", padding: "11px 12px", border: "none", cursor: "pointer", borderBottom: "1px solid var(--border)", background: isActiveRow ? "color-mix(in srgb, var(--primary) 7%, transparent)" : "transparent", borderLeft: `3px solid ${isActiveRow ? "var(--primary)" : "transparent"}`, transition: "background 0.12s" }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: rs.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginRight: 10 }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: rs.fg }}>{initials(u)}</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: isActiveRow ? "var(--primary)" : "var(--foreground)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {fullName(u)}{u.id === currentUserId ? " (you)" : ""}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 1 }}>{ADMIN_ROLE_LABELS[u.role]}</div>
                  </div>
                  <div style={{ flexShrink: 0, marginLeft: 6 }}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: ss.dot, display: "inline-block" }} />
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right detail */}
        <div style={{ overflowY: "auto", background: "var(--surface)" }}>
          {active
            ? <UserDetail
                user={active}
                isSelf={active.id === currentUserId}
                onEdit={() => setModal("edit")}
                onDelete={() => setModal("delete")}
                onToggleActive={toggleActive}
              />
            : <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--muted-foreground)" }}>
                <UserCog size={36} style={{ marginBottom: 10, opacity: 0.25 }} />
                <p style={{ fontSize: 13 }}>Select a user to view their profile</p>
              </div>
          }
        </div>
      </div>
    </>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN SETTINGS PAGE
// ═════════════════════════════════════════════════════════════════════════════

export default function SettingsPage() {
  const [section, setSection] = useState<Section>("users");
  const active = NAV.find(n => n.id === section)!;

  return (
    <>
      <style>{`
        * { box-sizing: border-box; }
        @keyframes fadeUp { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
        @keyframes spin { to { transform: rotate(360deg); } }
        input[type=number]::-webkit-inner-spin-button { -webkit-appearance:none; }
      `}</style>

      <div style={{ display: "flex", height: "100vh", background: "var(--background)", overflow: "hidden" }}>

        {/* ── Left nav ── */}
        <div style={{ width: 240, borderRight: "1px solid var(--border)", background: "var(--surface)", display: "flex", flexDirection: "column", flexShrink: 0 }}>
          <div style={{ padding: "24px 20px 16px" }}>
            <h1 style={{ fontSize: 18, fontWeight: 800, color: "var(--foreground)", margin: 0 }}>Settings</h1>
            <p style={{ fontSize: 11, color: "var(--muted-foreground)", margin: "3px 0 0", fontWeight: 600 }}>Super admin · BS Tech Digital</p>
          </div>
          <nav style={{ flex: 1, padding: "0 10px 20px" }}>
            {NAV.map(n => {
              const isActive = n.id === section;
              return (
                <button key={n.id} onClick={() => setSection(n.id)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 9, border: "none", cursor: "pointer", marginBottom: 2, background: isActive ? "color-mix(in srgb, var(--primary) 10%, transparent)" : "transparent", color: isActive ? "var(--primary)" : "var(--muted-foreground)", fontWeight: isActive ? 700 : 500, fontSize: 13, textAlign: "left", transition: "all 0.12s" }}>
                  {n.icon}
                  {n.label}
                  {isActive && <ChevronRight size={13} style={{ marginLeft: "auto" }} />}
                </button>
              );
            })}
          </nav>
          {/* Super admin badge */}
          <div style={{ margin: "0 10px 20px", padding: "12px", background: "color-mix(in srgb, var(--primary) 8%, transparent)", borderRadius: 10, border: "1px solid color-mix(in srgb, var(--primary) 20%, transparent)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <ShieldCheck size={14} color="var(--primary)" />
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--primary)" }}>Super Admin</span>
            </div>
            <p style={{ fontSize: 11, color: "var(--muted-foreground)", margin: "5px 0 0", lineHeight: 1.5 }}>Full unrestricted access to all system settings.</p>
          </div>
        </div>

        {/* ── Main content ── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* Section header */}
          <div style={{ padding: "22px 28px 18px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 34, height: 34, borderRadius: 9, background: "var(--background)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--primary)" }}>
                {active.icon}
              </div>
              <div>
                <h2 style={{ fontSize: 17, fontWeight: 700, color: "var(--foreground)", margin: 0 }}>{active.label}</h2>
                <p style={{ fontSize: 12, color: "var(--muted-foreground)", margin: 0 }}>{active.desc}</p>
              </div>
            </div>
          </div>

          {/* Section body */}
          <div style={{ flex: 1, overflow: section === "users" ? "hidden" : "auto", padding: section === "users" ? "20px 28px" : "28px 28px" }}>
            {section === "users"         && <UsersSection />}
            {section === "security"      && <SecuritySection />}
            {section === "system"        && <SystemSection />}
            {section === "notifications" && <NotificationsSection />}
            {section === "about"         && <AboutSection />}
          </div>
        </div>
      </div>
    </>
  );
}