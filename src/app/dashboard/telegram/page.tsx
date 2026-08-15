"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Send, Plus, X, Check, Loader2, AlertCircle, Copy, RefreshCw,
  Users, CalendarClock, CheckCircle2, XCircle, Trash2, Pencil, Play, MessageSquare,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type StationOption = { id: string; name: string; code: string };

type Recipient = {
  id: string;
  label: string;
  phone: string | null;
  linkToken: string;
  isLinked: boolean;
  telegramUsername: string | null;
  telegramFirstName: string | null;
  linkedAt: string | null;
  isActive: boolean;
  stationId: string | null;
  station: { id: string; name: string } | null;
};

type ReportType = "DAILY_SALES_SUMMARY" | "DAILY_DEPOSITS_SUMMARY" | "DAILY_SERVICE_CHARGE_BREAKDOWN" | "CUSTOM";
type ReportFor = "TODAY" | "YESTERDAY";
type Frequency = "DAILY" | "EVERY_N_DAYS" | "WEEKLY" | "MONTHLY" | "QUARTERLY" | "YEARLY";

type Schedule = {
  id: string;
  name: string;
  reportType: ReportType;
  reportFor: ReportFor;
  messageTemplate: string | null;
  includeDetailedFile: boolean;
  frequency: Frequency;
  intervalDays: number | null;
  anchorDate: string | null;
  weekday: number | null;
  dayOfMonth: number | null;
  monthOfYear: number | null;
  sendHour: number;
  sendMinute: number;
  isActive: boolean;
  lastRunDate: string | null;
  lastRunStatus: string | null;
  recipients: { id: string; label: string }[];
};

const FREQUENCY_LABELS: Record<Frequency, string> = {
  DAILY: "Daily",
  EVERY_N_DAYS: "Every N days",
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  YEARLY: "Yearly",
};

const WEEKDAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_LABELS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function describeFrequency(s: Schedule): string {
  switch (s.frequency) {
    case "DAILY": return "Daily";
    case "EVERY_N_DAYS": return `Every ${s.intervalDays ?? "?"} days`;
    case "WEEKLY": return `Weekly · ${WEEKDAY_LABELS[s.weekday ?? 0]}`;
    case "MONTHLY": return `Monthly · day ${s.dayOfMonth ?? "?"}`;
    case "QUARTERLY": return `Quarterly · day ${s.dayOfMonth ?? "?"} (Jan/Apr/Jul/Oct)`;
    case "YEARLY": return `Yearly · ${MONTH_LABELS[(s.monthOfYear ?? 1) - 1]} ${s.dayOfMonth ?? "?"}`;
  }
}

type MessageLog = {
  id: string;
  recipient: { id: string; label: string } | null;
  schedule: { id: string; name: string } | null;
  reportType: ReportType;
  content: string;
  status: "SENT" | "FAILED";
  errorMessage: string | null;
  sentAt: string;
};

const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  DAILY_SALES_SUMMARY: "Daily sales summary",
  DAILY_DEPOSITS_SUMMARY: "Daily deposits summary",
  DAILY_SERVICE_CHARGE_BREAKDOWN: "Daily service charge breakdown",
  CUSTOM: "Custom message",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { headers: { "Content-Type": "application/json" }, ...init });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.message ?? json?.error ?? `Request failed: ${res.status}`);
  return json as T;
}

function fmtTime(hour: number, minute: number) {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}
function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

const iCss: React.CSSProperties = {
  height: 40, padding: "0 12px", border: "1.5px solid var(--border)", borderRadius: 9,
  background: "var(--surface)", color: "var(--foreground)", fontSize: 14, outline: "none", width: "100%",
};

function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useState(() => { const t = setTimeout(onDone, 3200); return () => clearTimeout(t); });
  return (
    <div style={{ position: "fixed", bottom: 28, right: 28, zIndex: 9999, background: "#0f172a", color: "#fff", padding: "12px 20px", borderRadius: 12, fontSize: 14, fontWeight: 500, display: "flex", alignItems: "center", gap: 8, boxShadow: "0 8px 30px rgb(0 0 0 / 0.18)", maxWidth: 420 }}>
      <Check size={15} strokeWidth={2.5} color="#4ade80" style={{ flexShrink: 0 }} />{message}
    </div>
  );
}

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgb(0 0 0 / 0.35)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: "var(--surface)", borderRadius: 18, width: "100%", maxWidth: wide ? 560 : 460, boxShadow: "0 24px 60px rgb(0 0 0 / 0.18)", border: "1px solid var(--border)", maxHeight: "90vh", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 24px 0", flexShrink: 0 }}>
          <span style={{ fontSize: 17, fontWeight: 700, color: "var(--foreground)" }}>{title}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", padding: 4 }}><X size={18} /></button>
        </div>
        <div style={{ padding: "20px 24px 24px", overflowY: "auto" }}>{children}</div>
      </div>
    </div>
  );
}

// ─── Add recipient modal ──────────────────────────────────────────────────────

function AddRecipientModal({ botUsername, stations, onSaved, onClose }: { botUsername: string | null; stations: StationOption[]; onSaved: (msg: string) => void; onClose: () => void }) {
  const [label, setLabel] = useState("");
  const [phone, setPhone] = useState("");
  const [stationId, setStationId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ id: string; label: string; linkToken: string } | null>(null);
  const [smsStatus, setSmsStatus] = useState<"idle" | "sending" | "sent" | "failed">("idle");

  async function save() {
    if (!label.trim() || saving) return;
    setSaving(true); setError(null);
    try {
      const trimmedPhone = phone.trim();
      const res = await apiFetch<{ id: string; label: string; linkToken: string }>("/api/telegram/recipients", {
        method: "POST", body: JSON.stringify({ label: label.trim(), phone: trimmedPhone || undefined, stationId: stationId || undefined }),
      });
      setCreated(res);
      // Smooth the common case: a phone was given, so text the link right
      // away instead of making the admin do a separate step for it.
      if (trimmedPhone) {
        setSmsStatus("sending");
        try {
          await apiFetch(`/api/telegram/recipients/${res.id}/send-link`, { method: "POST" });
          setSmsStatus("sent");
        } catch {
          setSmsStatus("failed");
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add recipient.");
    } finally {
      setSaving(false);
    }
  }

  const link = created && botUsername ? `https://t.me/${botUsername}?start=${created.linkToken}` : null;

  if (created) {
    return (
      <Modal title="Recipient added" onClose={() => { onSaved(`${created.label} added.`); onClose(); }}>
        <p style={{ fontSize: 13.5, color: "var(--muted-foreground)", marginBottom: 14, lineHeight: 1.55 }}>
          Send this link to <strong style={{ color: "var(--foreground)" }}>{created.label}</strong> — they tap it, hit &ldquo;Start&rdquo; in Telegram once, and they&apos;re linked. You can always copy or re-send it later from the recipients list too.
        </p>
        {smsStatus === "sending" && (
          <div style={{ fontSize: 12.5, color: "var(--muted-foreground)", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
            <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> Texting the link…
          </div>
        )}
        {smsStatus === "sent" && (
          <div style={{ fontSize: 12.5, color: "var(--success)", marginBottom: 10 }}>Link texted to their phone.</div>
        )}
        {smsStatus === "failed" && (
          <div style={{ fontSize: 12.5, color: "var(--danger)", marginBottom: 10 }}>Couldn&apos;t text the link automatically — copy it below instead.</div>
        )}
        {link ? (
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <input readOnly value={link} style={{ ...iCss, fontSize: 12.5, fontFamily: "monospace" }} onFocus={e => e.target.select()} />
            <button onClick={() => navigator.clipboard.writeText(link)} style={{ height: 40, padding: "0 14px", borderRadius: 9, border: "1.5px solid var(--border)", background: "var(--surface)", cursor: "pointer", color: "var(--foreground)", display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600 }}>
              <Copy size={13} /> Copy
            </button>
          </div>
        ) : (
          <div style={{ fontSize: 12.5, color: "var(--danger)" }}>
            Bot isn&apos;t connected yet (TELEGRAM_BOT_TOKEN missing) — once it is, their link is start token <code>{created.linkToken}</code> on your bot&apos;s t.me page.
          </div>
        )}
        <button onClick={() => { onSaved(`${created.label} added.`); onClose(); }} style={{ marginTop: 16, height: 40, width: "100%", borderRadius: 10, border: "none", background: "var(--primary)", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
          Done
        </button>
      </Modal>
    );
  }

  return (
    <Modal title="Add recipient" onClose={onClose}>
      <div style={{ marginBottom: 14 }}>
        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--muted-foreground)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Name</label>
        <input value={label} onChange={e => setLabel(e.target.value)} style={iCss} placeholder="e.g. Abelti (Owner)" autoFocus />
      </div>
      <div style={{ marginBottom: 14 }}>
        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--muted-foreground)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Phone (optional note)</label>
        <input value={phone} onChange={e => setPhone(e.target.value)} style={iCss} placeholder="+251900000000" />
      </div>
      <div style={{ marginBottom: 18 }}>
        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--muted-foreground)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Scope</label>
        <select style={{ ...iCss, cursor: "pointer" }} value={stationId} onChange={e => setStationId(e.target.value)}>
          <option value="">Everything (like the owner)</option>
          {stations.map(s => <option key={s.id} value={s.id}>{s.name} only — station cashier</option>)}
        </select>
        <p style={{ fontSize: 11.5, color: "var(--muted-foreground)", marginTop: 6, lineHeight: 1.5 }}>
          A station only sees that station&apos;s service charge breakdown, not everyone&apos;s — applies to the daily service charge report only.
        </p>
      </div>
      {error && (
        <div style={{ display: "flex", gap: 8, padding: "10px 12px", background: "var(--danger-bg)", borderRadius: 8, marginBottom: 14 }}>
          <AlertCircle size={15} color="var(--danger)" style={{ flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontSize: 13, color: "var(--danger)" }}>{error}</span>
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <button onClick={onClose} style={{ height: 40, padding: "0 18px", borderRadius: 10, border: "1.5px solid var(--border)", background: "var(--surface)", fontSize: 14, cursor: "pointer", color: "var(--foreground)" }}>Cancel</button>
        <button onClick={save} disabled={!label.trim() || saving} style={{ height: 40, padding: "0 22px", borderRadius: 10, border: "none", background: "var(--primary)", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", opacity: label.trim() && !saving ? 1 : 0.5, display: "flex", alignItems: "center", gap: 7 }}>
          {saving && <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />}
          Add
        </button>
      </div>
    </Modal>
  );
}

// ─── Edit recipient scope modal ────────────────────────────────────────────────

function EditRecipientScopeModal({ recipient, stations, onSaved, onClose }: {
  recipient: Recipient; stations: StationOption[]; onSaved: (msg: string) => void; onClose: () => void;
}) {
  const [stationId, setStationId] = useState(recipient.stationId ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (saving) return;
    setSaving(true); setError(null);
    try {
      await apiFetch(`/api/telegram/recipients/${recipient.id}`, {
        method: "PATCH", body: JSON.stringify({ stationId: stationId || null }),
      });
      onSaved(`${recipient.label}'s scope updated.`);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`Scope — ${recipient.label}`} onClose={onClose}>
      <div style={{ marginBottom: 18 }}>
        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--muted-foreground)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Scope</label>
        <select style={{ ...iCss, cursor: "pointer" }} value={stationId} onChange={e => setStationId(e.target.value)}>
          <option value="">Everything (like the owner)</option>
          {stations.map(s => <option key={s.id} value={s.id}>{s.name} only — station cashier</option>)}
        </select>
        <p style={{ fontSize: 11.5, color: "var(--muted-foreground)", marginTop: 6, lineHeight: 1.5 }}>
          A station only sees that station&apos;s service charge breakdown, not everyone&apos;s — applies to the daily service charge report only.
        </p>
      </div>
      {error && (
        <div style={{ display: "flex", gap: 8, padding: "10px 12px", background: "var(--danger-bg)", borderRadius: 8, marginBottom: 14 }}>
          <AlertCircle size={15} color="var(--danger)" style={{ flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontSize: 13, color: "var(--danger)" }}>{error}</span>
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <button onClick={onClose} style={{ height: 40, padding: "0 18px", borderRadius: 10, border: "1.5px solid var(--border)", background: "var(--surface)", fontSize: 14, cursor: "pointer", color: "var(--foreground)" }}>Cancel</button>
        <button onClick={save} disabled={saving} style={{ height: 40, padding: "0 22px", borderRadius: 10, border: "none", background: "var(--primary)", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", opacity: saving ? 0.5 : 1, display: "flex", alignItems: "center", gap: 7 }}>
          {saving && <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />}
          Save
        </button>
      </div>
    </Modal>
  );
}

// ─── Schedule modal ───────────────────────────────────────────────────────────

function ScheduleModal({ initial, recipients, onSaved, onClose }: {
  initial?: Schedule; recipients: Recipient[]; onSaved: (msg: string) => void; onClose: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [reportType, setReportType] = useState<ReportType>(initial?.reportType ?? "DAILY_SALES_SUMMARY");
  const [reportFor, setReportFor] = useState<ReportFor>(initial?.reportFor ?? "YESTERDAY");
  const [messageTemplate, setMessageTemplate] = useState(initial?.messageTemplate ?? "");
  const [includeDetailedFile, setIncludeDetailedFile] = useState(initial?.includeDetailedFile ?? false);
  const [time, setTime] = useState(initial ? fmtTime(initial.sendHour, initial.sendMinute) : "08:00");
  const [frequency, setFrequency] = useState<Frequency>(initial?.frequency ?? "DAILY");
  const [intervalDays, setIntervalDays] = useState(initial?.intervalDays ?? 2);
  const [anchorDate, setAnchorDate] = useState(initial?.anchorDate?.slice(0, 10) ?? new Date().toISOString().slice(0, 10));
  const [weekday, setWeekday] = useState(initial?.weekday ?? 1);
  const [dayOfMonth, setDayOfMonth] = useState(initial?.dayOfMonth ?? 1);
  const [monthOfYear, setMonthOfYear] = useState(initial?.monthOfYear ?? 1);
  const [selected, setSelected] = useState<Set<string>>(new Set(initial?.recipients.map(r => r.id) ?? []));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(id: string) {
    setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  const valid = name.trim() && selected.size > 0 && (reportType !== "CUSTOM" || messageTemplate.trim());

  async function save() {
    if (!valid || saving) return;
    setSaving(true); setError(null);
    try {
      const [h, m] = time.split(":").map(Number);
      const payload = {
        name: name.trim(),
        reportType,
        reportFor: reportType === "CUSTOM" ? undefined : reportFor,
        messageTemplate: reportType === "CUSTOM" ? messageTemplate.trim() : undefined,
        includeDetailedFile: reportType === "CUSTOM" ? false : includeDetailedFile,
        frequency,
        intervalDays: frequency === "EVERY_N_DAYS" ? intervalDays : undefined,
        anchorDate: frequency === "EVERY_N_DAYS" ? anchorDate : undefined,
        weekday: frequency === "WEEKLY" ? weekday : undefined,
        dayOfMonth: frequency === "MONTHLY" || frequency === "QUARTERLY" || frequency === "YEARLY" ? dayOfMonth : undefined,
        monthOfYear: frequency === "YEARLY" ? monthOfYear : undefined,
        sendHour: h,
        sendMinute: m,
        recipientIds: Array.from(selected),
      };
      if (initial) {
        await apiFetch(`/api/telegram/schedules/${initial.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      } else {
        await apiFetch("/api/telegram/schedules", { method: "POST", body: JSON.stringify(payload) });
      }
      onSaved(initial ? "Schedule updated." : "Schedule created.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save schedule.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={initial ? "Edit schedule" : "New schedule"} onClose={onClose} wide>
      <div style={{ marginBottom: 14 }}>
        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--muted-foreground)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Name</label>
        <input value={name} onChange={e => setName(e.target.value)} style={iCss} placeholder="e.g. Morning sales recap" autoFocus />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
        <div>
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--muted-foreground)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Report type</label>
          <select style={{ ...iCss, cursor: "pointer" }} value={reportType} onChange={e => setReportType(e.target.value as ReportType)}>
            {Object.entries(REPORT_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div>
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--muted-foreground)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Send time (Addis Ababa)</label>
          <input type="time" value={time} onChange={e => setTime(e.target.value)} style={iCss} />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
        <div>
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--muted-foreground)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Frequency</label>
          <select style={{ ...iCss, cursor: "pointer" }} value={frequency} onChange={e => setFrequency(e.target.value as Frequency)}>
            {Object.entries(FREQUENCY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>

        {frequency === "EVERY_N_DAYS" && (
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--muted-foreground)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Every N days</label>
              <input type="number" min={2} max={365} value={intervalDays} onChange={e => setIntervalDays(Number(e.target.value) || 2)} style={iCss} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--muted-foreground)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Starting from</label>
              <input type="date" value={anchorDate} onChange={e => setAnchorDate(e.target.value)} style={iCss} />
            </div>
          </div>
        )}

        {frequency === "WEEKLY" && (
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--muted-foreground)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Day of week</label>
            <select style={{ ...iCss, cursor: "pointer" }} value={weekday} onChange={e => setWeekday(Number(e.target.value))}>
              {WEEKDAY_LABELS.map((label, i) => <option key={label} value={i}>{label}</option>)}
            </select>
          </div>
        )}

        {(frequency === "MONTHLY" || frequency === "QUARTERLY") && (
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--muted-foreground)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Day of month {frequency === "QUARTERLY" && "(Jan/Apr/Jul/Oct)"}
            </label>
            <input type="number" min={1} max={31} value={dayOfMonth} onChange={e => setDayOfMonth(Number(e.target.value) || 1)} style={iCss} />
          </div>
        )}

        {frequency === "YEARLY" && (
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--muted-foreground)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Month</label>
              <select style={{ ...iCss, cursor: "pointer" }} value={monthOfYear} onChange={e => setMonthOfYear(Number(e.target.value))}>
                {MONTH_LABELS.map((label, i) => <option key={label} value={i + 1}>{label}</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--muted-foreground)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Day</label>
              <input type="number" min={1} max={31} value={dayOfMonth} onChange={e => setDayOfMonth(Number(e.target.value) || 1)} style={iCss} />
            </div>
          </div>
        )}
      </div>

      {reportType !== "CUSTOM" && (
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--muted-foreground)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Covers</label>
          <select style={{ ...iCss, cursor: "pointer" }} value={reportFor} onChange={e => setReportFor(e.target.value as ReportFor)}>
            <option value="YESTERDAY">Yesterday (full day recap)</option>
            <option value="TODAY">Today so far</option>
          </select>
        </div>
      )}

      {(reportType === "DAILY_SALES_SUMMARY" || reportType === "DAILY_DEPOSITS_SUMMARY") && (
        <label style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 18, padding: "10px 12px", borderRadius: 9, border: "1.5px solid var(--border)", background: "var(--background)", cursor: "pointer" }}>
          <input type="checkbox" checked={includeDetailedFile} onChange={e => setIncludeDetailedFile(e.target.checked)} style={{ marginTop: 2 }} />
          <span>
            <span style={{ display: "block", fontSize: 13.5, fontWeight: 600, color: "var(--foreground)" }}>Attach detailed Excel workbook</span>
            <span style={{ display: "block", fontSize: 12, color: "var(--muted-foreground)", marginTop: 2 }}>
              {reportType === "DAILY_SALES_SUMMARY"
                ? "Every trip that day, plus rollups by station, ticketer, and route — sent alongside the short text recap."
                : "Every deposit that day, plus a per-terminal rollup — sent alongside the short text recap."}
            </span>
          </span>
        </label>
      )}

      {reportType === "DAILY_SERVICE_CHARGE_BREAKDOWN" && (
        <div style={{ marginBottom: 18, padding: "10px 12px", borderRadius: 9, border: "1.5px solid var(--border)", background: "var(--background)", fontSize: 12, color: "var(--muted-foreground)", lineHeight: 1.5 }}>
          Service charge only, broken down by station → ticketer → route, with a subtotal at every level and a grand total — sent as plain Telegram text (split across multiple messages on a busy day rather than truncated). No file attachment for this report type.
        </div>
      )}

      {reportType === "CUSTOM" && (
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--muted-foreground)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Message ({"{{date}}"} inserts the send date)</label>
          <textarea value={messageTemplate} onChange={e => setMessageTemplate(e.target.value)} rows={4} style={{ ...iCss, height: "auto", padding: 12, resize: "vertical" }} placeholder="Good morning team, reminder for {{date}}…" />
        </div>
      )}

      <div style={{ marginBottom: 18 }}>
        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--muted-foreground)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>Recipients</label>
        <div style={{ border: "1.5px solid var(--border)", borderRadius: 9, maxHeight: 160, overflowY: "auto" }}>
          {recipients.length === 0 && <div style={{ padding: 14, fontSize: 13, color: "var(--muted-foreground)" }}>No recipients yet — add one first.</div>}
          {recipients.map(r => (
            <label key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderBottom: "1px solid var(--border)", cursor: "pointer", fontSize: 13.5 }}>
              <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} />
              <span style={{ color: "var(--foreground)", fontWeight: 500 }}>{r.label}</span>
              {!r.isLinked && <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>(not linked yet)</span>}
            </label>
          ))}
        </div>
      </div>

      {error && (
        <div style={{ display: "flex", gap: 8, padding: "10px 12px", background: "var(--danger-bg)", borderRadius: 8, marginBottom: 14 }}>
          <AlertCircle size={15} color="var(--danger)" style={{ flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontSize: 13, color: "var(--danger)" }}>{error}</span>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <button onClick={onClose} style={{ height: 40, padding: "0 18px", borderRadius: 10, border: "1.5px solid var(--border)", background: "var(--surface)", fontSize: 14, cursor: "pointer", color: "var(--foreground)" }}>Cancel</button>
        <button onClick={save} disabled={!valid || saving} style={{ height: 40, padding: "0 22px", borderRadius: 10, border: "none", background: "var(--primary)", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", opacity: valid && !saving ? 1 : 0.5, display: "flex", alignItems: "center", gap: 7 }}>
          {saving && <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />}
          {initial ? "Save changes" : "Create schedule"}
        </button>
      </div>
    </Modal>
  );
}

// ─── Custom send panel ────────────────────────────────────────────────────────

function CustomSendPanel({ recipients, onSent }: { recipients: Recipient[]; onSent: (msg: string) => void }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(id: string) {
    setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  async function send() {
    if (selected.size === 0 || !message.trim() || sending) return;
    setSending(true); setError(null);
    try {
      const res = await apiFetch<{ sent: number; failed: number }>("/api/telegram/send-custom", {
        method: "POST", body: JSON.stringify({ recipientIds: Array.from(selected), message: message.trim() }),
      });
      onSent(`Sent to ${res.sent}, failed ${res.failed}.`);
      setMessage(""); setSelected(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>
      <p style={{ fontSize: 13, fontWeight: 700, color: "var(--foreground)", marginBottom: 12 }}>Send a one-off message now</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        {recipients.filter(r => r.isLinked).map(r => (
          <button key={r.id} onClick={() => toggle(r.id)} style={{
            fontSize: 12.5, fontWeight: 600, padding: "5px 12px", borderRadius: 999, cursor: "pointer",
            border: `1.5px solid ${selected.has(r.id) ? "var(--primary)" : "var(--border)"}`,
            background: selected.has(r.id) ? "color-mix(in srgb, var(--primary) 12%, transparent)" : "var(--background)",
            color: selected.has(r.id) ? "var(--primary)" : "var(--foreground)",
          }}>
            {r.label}
          </button>
        ))}
        {recipients.filter(r => r.isLinked).length === 0 && (
          <span style={{ fontSize: 12.5, color: "var(--muted-foreground)" }}>No linked recipients yet.</span>
        )}
      </div>
      <textarea value={message} onChange={e => setMessage(e.target.value)} rows={3} style={{ width: "100%", padding: 12, border: "1.5px solid var(--border)", borderRadius: 9, background: "var(--background)", color: "var(--foreground)", fontSize: 14, outline: "none", resize: "vertical", marginBottom: 10 }} placeholder="Write a message to send right now…" />
      {error && <div style={{ fontSize: 12.5, color: "var(--danger)", marginBottom: 10 }}>{error}</div>}
      <button onClick={send} disabled={selected.size === 0 || !message.trim() || sending} style={{ height: 38, padding: "0 18px", borderRadius: 9, border: "none", background: "var(--primary)", color: "#fff", fontSize: 13.5, fontWeight: 600, cursor: "pointer", opacity: selected.size > 0 && message.trim() && !sending ? 1 : 0.5, display: "flex", alignItems: "center", gap: 7 }}>
        {sending ? <Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} /> : <Send size={14} />}
        Send now
      </button>
      {(selected.size === 0 || !message.trim()) && !sending && (
        <p style={{ fontSize: 11.5, color: "var(--muted-foreground)", marginTop: 8 }}>
          {selected.size === 0 ? "Tap at least one recipient above" : "Write a message"} to enable sending.
        </p>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function TelegramPage() {
  const [status, setStatus] = useState<{ connected: boolean; username?: string; message?: string } | null>(null);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [messages, setMessages] = useState<MessageLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [checkingReplies, setCheckingReplies] = useState(false);
  const [runningNow, setRunningNow] = useState<string | null>(null);

  const [stations, setStations] = useState<StationOption[]>([]);
  const [showAddRecipient, setShowAddRecipient] = useState(false);
  const [scheduleModal, setScheduleModal] = useState<"new" | Schedule | null>(null);
  const [scopeModalRecipient, setScopeModalRecipient] = useState<Recipient | null>(null);
  const [sendingLinkId, setSendingLinkId] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    const [statusRes, recipientsRes, schedulesRes, messagesRes, stationsRes] = await Promise.all([
      apiFetch<{ connected: boolean; username?: string; message?: string }>("/api/telegram/status").catch(() => ({ connected: false })),
      apiFetch<{ data: Recipient[] }>("/api/telegram/recipients"),
      apiFetch<{ data: Schedule[] }>("/api/telegram/schedules"),
      apiFetch<{ data: MessageLog[] }>("/api/telegram/messages?limit=30"),
      apiFetch<{ data: StationOption[] }>("/api/stations?limit=1000"),
    ]);
    setStatus(statusRes);
    setRecipients(recipientsRes.data);
    setSchedules(schedulesRes.data);
    setMessages(messagesRes.data);
    setStations(stationsRes.data.map(s => ({ id: s.id, name: s.name, code: s.code })));
  }, []);

  useEffect(() => {
    setLoading(true);
    loadAll().catch(e => setToast(e instanceof Error ? e.message : "Failed to load.")).finally(() => setLoading(false));
  }, [loadAll]);

  // While anyone's still Pending, quietly check for new /start replies every
  // few seconds so linking shows up on its own — no more "I linked it but
  // the dashboard still shows Pending" confusion from having to remember to
  // click "Check for replies" yourself.
  useEffect(() => {
    if (!recipients.some(r => !r.isLinked)) return;
    const interval = setInterval(() => {
      apiFetch("/api/telegram/poll-updates", { method: "POST" }).then(loadAll).catch(() => {});
    }, 8000);
    return () => clearInterval(interval);
  }, [recipients, loadAll]);

  async function sendLink(id: string) {
    setSendingLinkId(id);
    try {
      await apiFetch(`/api/telegram/recipients/${id}/send-link`, { method: "POST" });
      setToast("Link texted.");
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Failed to text the link.");
    } finally {
      setSendingLinkId(null);
    }
  }

  function copyLink(linkToken: string) {
    if (!status?.username) {
      setToast("Bot isn't connected yet — can't build a link.");
      return;
    }
    navigator.clipboard.writeText(`https://t.me/${status.username}?start=${linkToken}`);
    setToast("Link copied.");
  }

  async function checkReplies() {
    setCheckingReplies(true);
    try {
      const res = await apiFetch<{ processed: number; linked: number }>("/api/telegram/poll-updates", { method: "POST" });
      setToast(`Checked ${res.processed} update(s) — ${res.linked} newly linked.`);
      await loadAll();
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Failed to check for replies.");
    } finally {
      setCheckingReplies(false);
    }
  }

  async function removeRecipient(id: string) {
    if (!confirm("Remove this recipient?")) return;
    try {
      await apiFetch(`/api/telegram/recipients/${id}`, { method: "DELETE" });
      await loadAll();
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Failed to remove.");
    }
  }

  async function sendScheduleNow(id: string) {
    setRunningNow(id);
    try {
      const res = await apiFetch<{ sent: number; failed: number }>(`/api/telegram/schedules/${id}/send-now`, { method: "POST" });
      setToast(`Sent to ${res.sent}, failed ${res.failed}.`);
      await loadAll();
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Failed to send.");
    } finally {
      setRunningNow(null);
    }
  }

  async function toggleScheduleActive(s: Schedule) {
    try {
      await apiFetch(`/api/telegram/schedules/${s.id}`, { method: "PATCH", body: JSON.stringify({ isActive: !s.isActive }) });
      await loadAll();
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Failed to update.");
    }
  }

  async function deleteSchedule(id: string) {
    if (!confirm("Delete this schedule? Its message history is kept.")) return;
    try {
      await apiFetch(`/api/telegram/schedules/${id}`, { method: "DELETE" });
      await loadAll();
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Failed to delete.");
    }
  }

  const stats = useMemo(() => ({
    linked: recipients.filter(r => r.isLinked).length,
    total: recipients.length,
    activeSchedules: schedules.filter(s => s.isActive).length,
    sentToday: messages.filter(m => m.status === "SENT" && new Date(m.sentAt).toDateString() === new Date().toDateString()).length,
    failedRecent: messages.filter(m => m.status === "FAILED").length,
  }), [recipients, schedules, messages]);

  return (
    <>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } } * { box-sizing: border-box; }`}</style>
      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
      {showAddRecipient && (
        <AddRecipientModal botUsername={status?.username ?? null} stations={stations} onSaved={(msg) => { setToast(msg); loadAll(); }} onClose={() => setShowAddRecipient(false)} />
      )}
      {scopeModalRecipient && (
        <EditRecipientScopeModal recipient={scopeModalRecipient} stations={stations} onSaved={(msg) => { setToast(msg); loadAll(); }} onClose={() => setScopeModalRecipient(null)} />
      )}
      {scheduleModal && (
        <ScheduleModal
          initial={scheduleModal === "new" ? undefined : scheduleModal}
          recipients={recipients}
          onSaved={(msg) => { setToast(msg); setScheduleModal(null); loadAll(); }}
          onClose={() => setScheduleModal(null)}
        />
      )}

      <div className="page-pad" style={{ minHeight: "100vh", background: "var(--background)", padding: "24px 28px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--foreground)", margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
              <Send size={22} /> Telegram Reporting
            </h1>
            <p style={{ fontSize: 13, color: "var(--muted-foreground)", margin: "3px 0 0", display: "flex", alignItems: "center", gap: 8 }}>
              {status?.connected ? (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "var(--success)" }}><CheckCircle2 size={13} /> Connected as @{status.username}</span>
              ) : (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "var(--danger)" }}><XCircle size={13} /> Not connected — set TELEGRAM_BOT_TOKEN</span>
              )}
            </p>
          </div>
          <button onClick={checkReplies} disabled={checkingReplies} style={{ height: 40, padding: "0 16px", borderRadius: 10, border: "1.5px solid var(--border)", background: "var(--surface)", fontSize: 14, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 7, color: "var(--foreground)" }}>
            {checkingReplies ? <Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} /> : <RefreshCw size={15} />}
            Check for replies
          </button>
        </div>

        <div className="grid-4" style={{ gap: 12, marginBottom: 20 }}>
          {[
            { label: "Recipients linked", value: `${stats.linked}/${stats.total}`, icon: <Users size={16} />, color: "#2563eb", bg: "#dbeafe" },
            { label: "Active schedules", value: stats.activeSchedules, icon: <CalendarClock size={16} />, color: "#16a34a", bg: "#dcfce7" },
            { label: "Sent today", value: stats.sentToday, icon: <CheckCircle2 size={16} />, color: "#16a34a", bg: "#dcfce7" },
            { label: "Recent failures", value: stats.failedRecent, icon: <XCircle size={16} />, color: "#dc2626", bg: "#fee2e2" },
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

        {/* Recipients */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <p style={{ fontSize: 15, fontWeight: 700, color: "var(--foreground)" }}>Recipients</p>
          <button onClick={() => setShowAddRecipient(true)} style={{ height: 34, padding: "0 14px", borderRadius: 9, border: "none", background: "var(--primary)", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            <Plus size={14} /> Add recipient
          </button>
        </div>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", marginBottom: 22 }}>
          {recipients.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", color: "var(--muted-foreground)", fontSize: 13 }}>No recipients yet.</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "var(--background)", borderBottom: "1px solid var(--border)" }}>
                    {["Name", "Phone", "Scope", "Telegram", "Status", "Link", ""].map(h => (
                      <th key={h} style={{ textAlign: "left", padding: "10px 14px", fontSize: 11, fontWeight: 700, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recipients.map(r => (
                    <tr key={r.id} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "10px 14px", fontWeight: 600, color: "var(--foreground)" }}>{r.label}</td>
                      <td style={{ padding: "10px 14px", color: "var(--muted-foreground)" }}>{r.phone ?? "—"}</td>
                      <td style={{ padding: "10px 14px" }}>
                        <button onClick={() => setScopeModalRecipient(r)} title="Change scope" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, border: "none", cursor: "pointer", background: r.station ? "#dbeafe" : "#f1f5f9", color: r.station ? "#1d4ed8" : "#64748b" }}>
                          {r.station ? r.station.name : "Everything"} <Pencil size={10} />
                        </button>
                      </td>
                      <td style={{ padding: "10px 14px", color: "var(--muted-foreground)" }}>{r.telegramUsername ? `@${r.telegramUsername}` : r.telegramFirstName ?? "—"}</td>
                      <td style={{ padding: "10px 14px" }}>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: r.isLinked ? "#dcfce7" : "#f1f5f9", color: r.isLinked ? "#16a34a" : "#64748b" }}>
                          {r.isLinked ? "Linked" : "Pending"}
                        </span>
                      </td>
                      <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                        {!r.isLinked && (
                          <div style={{ display: "inline-flex", gap: 6 }}>
                            <button onClick={() => copyLink(r.linkToken)} title="Copy link" style={{ height: 28, width: 28, borderRadius: 7, border: "1.5px solid var(--border)", background: "var(--surface)", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "var(--foreground)" }}>
                              <Copy size={12} />
                            </button>
                            {r.phone && (
                              <button onClick={() => sendLink(r.id)} disabled={sendingLinkId === r.id} title="Text the link" style={{ height: 28, width: 28, borderRadius: 7, border: "1.5px solid var(--border)", background: "var(--surface)", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "var(--foreground)" }}>
                                {sendingLinkId === r.id ? <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> : <MessageSquare size={12} />}
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: "10px 14px", textAlign: "right" }}>
                        <button onClick={() => removeRecipient(r.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", display: "inline-flex" }}>
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Schedules */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <p style={{ fontSize: 15, fontWeight: 700, color: "var(--foreground)" }}>Scheduled reports</p>
          <button onClick={() => setScheduleModal("new")} style={{ height: 34, padding: "0 14px", borderRadius: 9, border: "none", background: "var(--primary)", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            <Plus size={14} /> New schedule
          </button>
        </div>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", marginBottom: 22 }}>
          {schedules.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", color: "var(--muted-foreground)", fontSize: 13 }}>No schedules yet.</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "var(--background)", borderBottom: "1px solid var(--border)" }}>
                    {["Name", "Type", "Frequency", "Time", "Recipients", "Last run", "Active", ""].map(h => (
                      <th key={h} style={{ textAlign: "left", padding: "10px 14px", fontSize: 11, fontWeight: 700, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {schedules.map(s => (
                    <tr key={s.id} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "10px 14px", fontWeight: 600, color: "var(--foreground)", whiteSpace: "nowrap" }}>{s.name}</td>
                      <td style={{ padding: "10px 14px", color: "var(--muted-foreground)", whiteSpace: "nowrap" }}>
                        {REPORT_TYPE_LABELS[s.reportType]}
                        {s.includeDetailedFile && (
                          <span title="Attaches a detailed Excel workbook" style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 999, background: "#dbeafe", color: "#1d4ed8" }}>
                            + FILE
                          </span>
                        )}
                      </td>
                      <td style={{ padding: "10px 14px", color: "var(--muted-foreground)", whiteSpace: "nowrap" }}>{describeFrequency(s)}</td>
                      <td style={{ padding: "10px 14px", fontFamily: "monospace", whiteSpace: "nowrap" }}>{fmtTime(s.sendHour, s.sendMinute)}</td>
                      <td style={{ padding: "10px 14px", color: "var(--muted-foreground)" }}>{s.recipients.length}</td>
                      <td style={{ padding: "10px 14px", color: "var(--muted-foreground)", fontSize: 12, whiteSpace: "nowrap" }}>
                        {s.lastRunDate ? `${new Date(s.lastRunDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })} · ${s.lastRunStatus}` : "Never"}
                      </td>
                      <td style={{ padding: "10px 14px" }}>
                        <button onClick={() => toggleScheduleActive(s)} style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, border: "none", cursor: "pointer", background: s.isActive ? "#dcfce7" : "#f1f5f9", color: s.isActive ? "#16a34a" : "#64748b" }}>
                          {s.isActive ? "Active" : "Paused"}
                        </button>
                      </td>
                      <td style={{ padding: "10px 14px", textAlign: "right", whiteSpace: "nowrap" }}>
                        <div style={{ display: "inline-flex", gap: 6 }}>
                          <button onClick={() => sendScheduleNow(s.id)} disabled={runningNow === s.id} style={{ height: 30, width: 30, borderRadius: 8, border: "1.5px solid var(--border)", background: "var(--surface)", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "var(--foreground)" }} title="Send now">
                            {runningNow === s.id ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <Play size={13} />}
                          </button>
                          <button onClick={() => setScheduleModal(s)} style={{ height: 30, width: 30, borderRadius: 8, border: "1.5px solid var(--border)", background: "var(--surface)", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "var(--foreground)" }} title="Edit">
                            <Pencil size={13} />
                          </button>
                          <button onClick={() => deleteSchedule(s.id)} style={{ height: 30, width: 30, borderRadius: 8, border: "1.5px solid var(--border)", background: "var(--surface)", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "var(--danger)" }} title="Delete">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Custom send */}
        <div style={{ marginBottom: 22 }}>
          <CustomSendPanel recipients={recipients} onSent={(msg) => { setToast(msg); loadAll(); }} />
        </div>

        {/* Message log */}
        <p style={{ fontSize: 15, fontWeight: 700, color: "var(--foreground)", marginBottom: 10 }}>Recent messages</p>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
          {messages.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", color: "var(--muted-foreground)", fontSize: 13 }}>Nothing sent yet.</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "var(--background)", borderBottom: "1px solid var(--border)" }}>
                    {["Sent", "Recipient", "Type", "Status", "Note"].map(h => (
                      <th key={h} style={{ textAlign: "left", padding: "10px 14px", fontSize: 11, fontWeight: 700, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {messages.map(m => (
                    <tr key={m.id} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "10px 14px", color: "var(--muted-foreground)", whiteSpace: "nowrap" }}>{fmtDateTime(m.sentAt)}</td>
                      <td style={{ padding: "10px 14px", fontWeight: 600, color: "var(--foreground)", whiteSpace: "nowrap" }}>{m.recipient?.label ?? "—"}</td>
                      <td style={{ padding: "10px 14px", color: "var(--muted-foreground)", whiteSpace: "nowrap" }}>{REPORT_TYPE_LABELS[m.reportType]}</td>
                      <td style={{ padding: "10px 14px" }}>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: m.status === "SENT" ? "#dcfce7" : "#fee2e2", color: m.status === "SENT" ? "#16a34a" : "#dc2626" }}>{m.status}</span>
                      </td>
                      <td style={{ padding: "10px 14px", color: "var(--muted-foreground)", fontSize: 12, maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {m.errorMessage ?? m.content.replace(/<[^>]+>/g, "").slice(0, 60)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
