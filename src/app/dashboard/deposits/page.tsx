"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Landmark, RefreshCw, Loader2, AlertCircle, Check, X,
  Wallet, TrendingUp, AlertTriangle, Clock,
} from "lucide-react";

type DepositStatus = "AWAITING_SUBMISSION" | "SUBMITTED" | "VERIFIED_OK" | "VERIFIED_MISMATCH" | "FAILED" | "RESOLVED";

type DepositRow = {
  id: string;
  employee: { id: string; code: string; name: string } | null;
  terminal: { id: string; name: string } | null;
  date: string;
  expectedAmount: number;
  bank: string | null;
  referenceNumber: string | null;
  status: DepositStatus;
  verifiedAmount: number | null;
  discrepancyAmount: number | null;
  discrepancyReason: string | null;
  verifyErrorMessage: string | null;
};

type TerminalOption = { id: string; name: string };

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { headers: { "Content-Type": "application/json" }, ...init });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.message ?? json?.error ?? `Request failed: ${res.status}`);
  return json as T;
}

function fmtETB(n: number) {
  return new Intl.NumberFormat("en-ET", { style: "currency", currency: "ETB", maximumFractionDigits: 2 }).format(n);
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

const STATUS_STYLE: Record<DepositStatus, { label: string; bg: string; fg: string }> = {
  AWAITING_SUBMISSION: { label: "Awaiting", bg: "#f1f5f9", fg: "#64748b" },
  SUBMITTED: { label: "Verifying", bg: "#fef3c7", fg: "#b45309" },
  VERIFIED_OK: { label: "Matches", bg: "#dcfce7", fg: "#16a34a" },
  VERIFIED_MISMATCH: { label: "Mismatch", bg: "#fee2e2", fg: "#dc2626" },
  FAILED: { label: "Failed", bg: "#fee2e2", fg: "#dc2626" },
  RESOLVED: { label: "Resolved", bg: "#f1f5f9", fg: "#64748b" },
};

const iCss: React.CSSProperties = {
  height: 38, padding: "0 12px", border: "1.5px solid var(--border)", borderRadius: 9,
  background: "var(--surface)", color: "var(--foreground)", fontSize: 13, outline: "none",
};

function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useState(() => { const t = setTimeout(onDone, 3200); return () => clearTimeout(t); });
  return (
    <div style={{ position: "fixed", bottom: 28, right: 28, zIndex: 9999, background: "#0f172a", color: "#fff", padding: "12px 20px", borderRadius: 12, fontSize: 14, fontWeight: 500, display: "flex", alignItems: "center", gap: 8, boxShadow: "0 8px 30px rgb(0 0 0 / 0.18)", maxWidth: 420 }}>
      <Check size={15} strokeWidth={2.5} color="#4ade80" style={{ flexShrink: 0 }} />{message}
    </div>
  );
}

function ReasonModal({ deposit, onSaved, onClose }: { deposit: DepositRow; onSaved: () => void; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!reason.trim() || saving) return;
    setSaving(true); setError(null);
    try {
      await apiFetch(`/api/deposits/${deposit.id}`, { method: "PATCH", body: JSON.stringify({ reason: reason.trim() }) });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgb(0 0 0 / 0.35)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: "var(--surface)", borderRadius: 18, width: "100%", maxWidth: 480, boxShadow: "0 24px 60px rgb(0 0 0 / 0.18)", border: "1px solid var(--border)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 24px 0" }}>
          <span style={{ fontSize: 17, fontWeight: 700, color: "var(--foreground)" }}>Record discrepancy reason</span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", padding: 4 }}><X size={18} /></button>
        </div>
        <div style={{ padding: "20px 24px 24px" }}>
          <div style={{ background: "var(--background)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 14px", marginBottom: 16, fontSize: 13 }}>
            <div><strong>{deposit.employee?.name}</strong> · {deposit.terminal?.name} · {fmtDate(deposit.date)}</div>
            <div style={{ color: "var(--muted-foreground)", marginTop: 4 }}>
              Expected {fmtETB(deposit.expectedAmount)}
              {deposit.verifiedAmount !== null && <> · Verified {fmtETB(deposit.verifiedAmount)}</>}
              {deposit.discrepancyAmount !== null && (
                <span style={{ color: "var(--danger)" }}> ({deposit.discrepancyAmount > 0 ? "+" : ""}{fmtETB(deposit.discrepancyAmount)})</span>
              )}
              {deposit.verifyErrorMessage && <div style={{ color: "var(--danger)", marginTop: 4 }}>{deposit.verifyErrorMessage}</div>}
            </div>
          </div>

          <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--muted-foreground)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Reason</label>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            rows={4}
            style={{ width: "100%", padding: 12, border: "1.5px solid var(--border)", borderRadius: 9, background: "var(--surface)", color: "var(--foreground)", fontSize: 14, outline: "none", resize: "vertical", marginBottom: 14 }}
            placeholder="e.g. Cashier reported a customer complaint refund deducted before deposit…"
          />

          {error && (
            <div style={{ display: "flex", gap: 8, padding: "10px 12px", background: "var(--danger-bg)", borderRadius: 8, marginBottom: 14 }}>
              <AlertCircle size={15} color="var(--danger)" style={{ flexShrink: 0, marginTop: 1 }} />
              <span style={{ fontSize: 13, color: "var(--danger)" }}>{error}</span>
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <button onClick={onClose} style={{ height: 40, padding: "0 18px", borderRadius: 10, border: "1.5px solid var(--border)", background: "var(--surface)", fontSize: 14, cursor: "pointer", color: "var(--foreground)" }}>Cancel</button>
            <button onClick={save} disabled={!reason.trim() || saving} style={{ height: 40, padding: "0 22px", borderRadius: 10, border: "none", background: "var(--primary)", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", opacity: reason.trim() && !saving ? 1 : 0.5, display: "flex", alignItems: "center", gap: 7 }}>
              {saving && <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />}
              Resolve
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DepositsPage() {
  const [rows, setRows] = useState<DepositRow[]>([]);
  const [stats, setStats] = useState<{ byStatus: Record<string, number>; totalExpected: number; totalVerified: number }>({ byStatus: {}, totalExpected: 0, totalVerified: 0 });
  const [terminals, setTerminals] = useState<TerminalOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [terminalId, setTerminalId] = useState("");
  const [status, setStatus] = useState("");
  const [reasonTarget, setReasonTarget] = useState<DepositRow | null>(null);
  const [pollingAll, setPollingAll] = useState(false);
  const [pollingId, setPollingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      if (terminalId) params.set("terminalId", terminalId);
      if (status) params.set("status", status);
      params.set("limit", "200");
      const res = await apiFetch<{ data: DepositRow[]; stats: typeof stats }>(`/api/deposits?${params.toString()}`);
      setRows(res.data);
      setStats(res.stats);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load deposits.");
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, terminalId, status]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    apiFetch<{ data: TerminalOption[] }>("/api/terminals?isDeparture=true&limit=1000")
      .then(res => setTerminals(res.data))
      .catch(() => {});
  }, []);

  async function pollOne(id: string) {
    setPollingId(id);
    try {
      await apiFetch(`/api/deposits/${id}/poll`, { method: "POST" });
      await load();
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Refresh failed.");
    } finally {
      setPollingId(null);
    }
  }

  async function pollAll() {
    setPollingAll(true);
    try {
      const res = await apiFetch<{ checked: number; resolved: number; stillPending: number }>("/api/deposits/poll-pending", { method: "POST" });
      setToast(`Checked ${res.checked} pending — ${res.resolved} resolved, ${res.stillPending} still pending.`);
      await load();
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Refresh failed.");
    } finally {
      setPollingAll(false);
    }
  }

  const mismatchCount = (stats.byStatus.VERIFIED_MISMATCH ?? 0) + (stats.byStatus.FAILED ?? 0);
  const pendingCount = stats.byStatus.SUBMITTED ?? 0;

  return (
    <>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } } * { box-sizing: border-box; }`}</style>
      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
      {reasonTarget && (
        <ReasonModal deposit={reasonTarget} onSaved={() => { setReasonTarget(null); load(); setToast("Discrepancy resolved."); }} onClose={() => setReasonTarget(null)} />
      )}

      <div className="page-pad" style={{ minHeight: "100vh", background: "var(--background)", padding: "24px 28px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--foreground)", margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
              <Landmark size={22} /> Deposits
            </h1>
            <p style={{ fontSize: 13, color: "var(--muted-foreground)", margin: "3px 0 0" }}>
              Cashier deposit reconciliation, verified against verify.et.
            </p>
          </div>
          <button onClick={pollAll} disabled={pollingAll} style={{ height: 40, padding: "0 18px", borderRadius: 10, border: "1.5px solid var(--border)", background: "var(--surface)", fontSize: 14, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 7, color: "var(--foreground)" }}>
            {pollingAll ? <Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} /> : <RefreshCw size={15} />}
            Refresh pending
          </button>
        </div>

        <div className="grid-4" style={{ gap: 12, marginBottom: 18 }}>
          {[
            { label: "Total expected", value: fmtETB(stats.totalExpected), icon: <Wallet size={16} />, color: "#2563eb", bg: "#dbeafe" },
            { label: "Total verified", value: fmtETB(stats.totalVerified), icon: <TrendingUp size={16} />, color: "#16a34a", bg: "#dcfce7" },
            { label: "Mismatches / failed", value: mismatchCount, icon: <AlertTriangle size={16} />, color: "#dc2626", bg: "#fee2e2" },
            { label: "Verifying", value: pendingCount, icon: <Clock size={16} />, color: "#b45309", bg: "#fef3c7" },
          ].map(c => (
            <div key={c.label} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "12px 14px", display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 9, background: c.bg, color: c.color, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{c.icon}</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: "var(--foreground)", lineHeight: 1.2, fontFamily: "monospace", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{loading ? "—" : c.value}</div>
                <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 3 }}>{c.label}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 14, marginBottom: 14, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--muted-foreground)", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.05em" }}>From</label>
            <input type="date" style={iCss} value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--muted-foreground)", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.05em" }}>To</label>
            <input type="date" style={iCss} value={dateTo} onChange={e => setDateTo(e.target.value)} />
          </div>
          <div style={{ minWidth: 200 }}>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--muted-foreground)", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.05em" }}>Terminal</label>
            <select style={{ ...iCss, cursor: "pointer" }} value={terminalId} onChange={e => setTerminalId(e.target.value)}>
              <option value="">All terminals</option>
              {terminals.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div style={{ minWidth: 180 }}>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--muted-foreground)", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.05em" }}>Status</label>
            <select style={{ ...iCss, cursor: "pointer" }} value={status} onChange={e => setStatus(e.target.value)}>
              <option value="">All statuses</option>
              {Object.entries(STATUS_STYLE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
        </div>

        {error && (
          <div style={{ display: "flex", gap: 8, padding: "10px 12px", background: "var(--danger-bg)", borderRadius: 8, marginBottom: 14 }}>
            <AlertCircle size={15} color="var(--danger)" style={{ flexShrink: 0, marginTop: 1 }} />
            <span style={{ fontSize: 13, color: "var(--danger)" }}>{error}</span>
          </div>
        )}

        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--muted-foreground)", fontSize: 13 }}>Loading…</div>
        ) : rows.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "60px 0", color: "var(--muted-foreground)" }}>
            <Landmark size={36} style={{ marginBottom: 12, opacity: 0.25 }} />
            <p style={{ fontSize: 14 }}>No deposits in this range.</p>
          </div>
        ) : (
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "var(--background)", borderBottom: "1px solid var(--border)" }}>
                    {["Date", "Terminal", "Cashier", "Expected", "Verified", "Status", "Bank / ref", ""].map(h => (
                      <th key={h} style={{ textAlign: "left", padding: "10px 14px", fontSize: 11, fontWeight: 700, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(d => {
                    const s = STATUS_STYLE[d.status];
                    return (
                      <tr key={d.id} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "10px 14px", color: "var(--muted-foreground)", whiteSpace: "nowrap" }}>{fmtDate(d.date)}</td>
                        <td style={{ padding: "10px 14px", fontWeight: 600, color: "var(--foreground)", whiteSpace: "nowrap" }}>{d.terminal?.name ?? "—"}</td>
                        <td style={{ padding: "10px 14px", color: "var(--foreground)", whiteSpace: "nowrap" }}>{d.employee?.name ?? "—"}</td>
                        <td style={{ padding: "10px 14px", fontFamily: "monospace", whiteSpace: "nowrap" }}>{fmtETB(d.expectedAmount)}</td>
                        <td style={{ padding: "10px 14px", fontFamily: "monospace", whiteSpace: "nowrap" }}>
                          {d.verifiedAmount !== null ? fmtETB(d.verifiedAmount) : "—"}
                          {d.discrepancyAmount !== null && (
                            <span style={{ color: "var(--danger)", marginLeft: 6, fontSize: 11.5 }}>
                              ({d.discrepancyAmount > 0 ? "+" : ""}{fmtETB(d.discrepancyAmount)})
                            </span>
                          )}
                        </td>
                        <td style={{ padding: "10px 14px" }}>
                          <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: s.bg, color: s.fg }}>{s.label}</span>
                        </td>
                        <td style={{ padding: "10px 14px", color: "var(--muted-foreground)", fontSize: 12 }}>
                          {d.bank ? `${d.bank.toUpperCase()} · ${d.referenceNumber ?? "—"}` : "—"}
                        </td>
                        <td style={{ padding: "10px 14px", textAlign: "right", whiteSpace: "nowrap" }}>
                          {d.status === "SUBMITTED" && (
                            <button onClick={() => pollOne(d.id)} disabled={pollingId === d.id} style={{ height: 30, padding: "0 10px", borderRadius: 8, border: "1.5px solid var(--border)", background: "var(--surface)", fontSize: 12, cursor: "pointer", color: "var(--foreground)", display: "inline-flex", alignItems: "center", gap: 5 }}>
                              {pollingId === d.id ? <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> : <RefreshCw size={12} />} Refresh
                            </button>
                          )}
                          {(d.status === "VERIFIED_MISMATCH" || d.status === "FAILED") && (
                            <button onClick={() => setReasonTarget(d)} style={{ height: 30, padding: "0 10px", borderRadius: 8, border: "1.5px solid var(--border)", background: "var(--surface)", fontSize: 12, cursor: "pointer", color: "var(--foreground)" }}>
                              Add reason
                            </button>
                          )}
                          {d.status === "RESOLVED" && d.discrepancyReason && (
                            <span style={{ fontSize: 11.5, color: "var(--muted-foreground)", fontStyle: "italic" }}>{d.discrepancyReason.slice(0, 40)}{d.discrepancyReason.length > 40 ? "…" : ""}</span>
                          )}
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
