"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { LogOut, Loader2, CheckCircle2, AlertTriangle, XCircle, Clock, KeyRound } from "lucide-react";

type Bank = "cbe" | "boa" | "telebirr" | "mpesa" | "cbebirr" | "dashen" | "awash" | "siinqee" | "kaafiebirr";

const BANK_OPTIONS: { value: Bank; label: string }[] = [
  { value: "cbe", label: "Commercial Bank of Ethiopia (CBE)" },
  { value: "boa", label: "Bank of Abyssinia" },
  { value: "telebirr", label: "Telebirr" },
  { value: "mpesa", label: "M-Pesa" },
  { value: "cbebirr", label: "CBE Birr" },
  { value: "dashen", label: "Dashen Bank" },
  { value: "awash", label: "Awash Bank" },
  { value: "siinqee", label: "Siinqee Bank" },
  { value: "kaafiebirr", label: "Kaafi eBirr" },
];

type Deposit = {
  id: string;
  terminal: { id: string; name: string } | null;
  date: string;
  expectedAmount: number;
  status: "AWAITING_SUBMISSION" | "SUBMITTED" | "VERIFIED_OK" | "VERIFIED_MISMATCH" | "FAILED" | "RESOLVED";
  verifiedAmount: number | null;
  discrepancyAmount: number | null;
  verifyErrorMessage: string | null;
  bank: string | null;
  referenceNumber: string | null;
};

type Me = { employeeId: string; code: string; fullName: string; phone: string };

function fmtETB(n: number) {
  return new Intl.NumberFormat("en-ET", { style: "currency", currency: "ETB", maximumFractionDigits: 2 }).format(n);
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

const cardStyle: React.CSSProperties = {
  padding: "20px", borderRadius: 14, background: "var(--surface)", border: "1px solid var(--border)",
};

function StatusBadge({ status }: { status: Deposit["status"] }) {
  const map: Record<Deposit["status"], { label: string; color: string; bg: string; icon: React.ReactNode }> = {
    AWAITING_SUBMISSION: { label: "Awaiting submission", color: "var(--muted-foreground)", bg: "var(--background)", icon: <Clock size={13} /> },
    SUBMITTED: { label: "Verifying…", color: "#b45309", bg: "#fef3c7", icon: <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> },
    VERIFIED_OK: { label: "Verified — matches", color: "var(--success)", bg: "var(--success-bg)", icon: <CheckCircle2 size={13} /> },
    VERIFIED_MISMATCH: { label: "Verified — amount differs", color: "var(--danger)", bg: "var(--danger-bg)", icon: <AlertTriangle size={13} /> },
    FAILED: { label: "Couldn't verify", color: "var(--danger)", bg: "var(--danger-bg)", icon: <XCircle size={13} /> },
    RESOLVED: { label: "Resolved", color: "var(--muted-foreground)", bg: "var(--background)", icon: <CheckCircle2 size={13} /> },
  };
  const m = map[status];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, color: m.color, background: m.bg, padding: "4px 10px", borderRadius: 999 }}>
      {m.icon} {m.label}
    </span>
  );
}

function SubmitForm({ deposit, onSubmitted }: { deposit: Deposit; onSubmitted: () => void }) {
  const [bank, setBank] = useState<Bank>("telebirr");
  const [reference, setReference] = useState("");
  const [accountSuffix, setAccountSuffix] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsSuffix = bank === "cbe" || bank === "boa";
  const needsPhone = bank === "cbebirr";
  const suffixLen = bank === "cbe" ? 8 : 5;

  const valid =
    reference.trim().length >= 3 &&
    (!needsSuffix || new RegExp(`^\\d{${suffixLen}}$`).test(accountSuffix)) &&
    (!needsPhone || phoneNumber.trim().length >= 9);

  async function handleSubmit() {
    if (!valid || loading) return;
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/cashier/deposits/${deposit.id}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bank,
          reference: reference.trim(),
          accountSuffix: needsSuffix ? accountSuffix : undefined,
          phoneNumber: needsPhone ? phoneNumber.trim() : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message ?? "Submission failed.");
      onSubmitted();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Submission failed.");
    } finally {
      setLoading(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", height: 42, padding: "0 12px", borderRadius: 9,
    border: "1.5px solid var(--border)", background: "var(--surface)", fontSize: 14, color: "var(--foreground)", outline: "none",
  };

  return (
    <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
      {error && (
        <div style={{ fontSize: 12.5, color: "var(--danger)", background: "var(--danger-bg)", padding: "8px 10px", borderRadius: 8, marginBottom: 10 }}>
          {error}
        </div>
      )}
      <div style={{ display: "grid", gap: 10 }}>
        <div>
          <label style={{ fontSize: 12.5, fontWeight: 500, color: "var(--muted-foreground)", display: "block", marginBottom: 5 }}>Bank / provider</label>
          <select value={bank} onChange={(e) => setBank(e.target.value as Bank)} style={inputStyle}>
            {BANK_OPTIONS.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 12.5, fontWeight: 500, color: "var(--muted-foreground)", display: "block", marginBottom: 5 }}>
            {bank === "telebirr" || bank === "mpesa" ? "Transaction number" : bank === "cbebirr" ? "Receipt number" : "Reference number"}
          </label>
          <input value={reference} onChange={(e) => setReference(e.target.value)} style={inputStyle} placeholder="e.g. FT1234567890" />
        </div>
        {needsSuffix && (
          <div>
            <label style={{ fontSize: 12.5, fontWeight: 500, color: "var(--muted-foreground)", display: "block", marginBottom: 5 }}>
              Account suffix ({suffixLen} digits)
            </label>
            <input
              value={accountSuffix}
              onChange={(e) => setAccountSuffix(e.target.value.replace(/\D/g, "").slice(0, suffixLen))}
              style={inputStyle}
              inputMode="numeric"
            />
          </div>
        )}
        {needsPhone && (
          <div>
            <label style={{ fontSize: 12.5, fontWeight: 500, color: "var(--muted-foreground)", display: "block", marginBottom: 5 }}>Depositor phone number</label>
            <input value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} style={inputStyle} placeholder="09XXXXXXXX" />
          </div>
        )}
        <button
          onClick={handleSubmit}
          disabled={!valid || loading}
          style={{
            height: 42, borderRadius: 9, border: "none",
            background: valid && !loading ? "var(--primary)" : "color-mix(in srgb, var(--primary) 52%, #94a3b8)",
            color: "#fff", fontSize: 14, fontWeight: 600, cursor: valid ? "pointer" : "default",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}
        >
          {loading ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> : null}
          {loading ? "Submitting…" : "Submit for verification"}
        </button>
      </div>
    </div>
  );
}

export default function CashierPortalPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [deposits, setDeposits] = useState<Deposit[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadDeposits = useCallback(async () => {
    const res = await fetch("/api/cashier/deposits");
    if (res.status === 401) {
      router.push("/cashier/login");
      return;
    }
    const json = await res.json();
    if (res.ok) setDeposits(json.data);
  }, [router]);

  useEffect(() => {
    (async () => {
      const meRes = await fetch("/api/cashier/auth/me");
      if (meRes.status === 401) {
        router.push("/cashier/login");
        return;
      }
      const meJson = await meRes.json();
      setMe(meJson);
      await loadDeposits();
    })().catch(() => setError("Failed to load your account."));
  }, [router, loadDeposits]);

  useEffect(() => {
    const hasPending = deposits?.some((d) => d.status === "SUBMITTED");
    if (hasPending && !pollRef.current) {
      pollRef.current = setInterval(loadDeposits, 5000);
    }
    if (!hasPending && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [deposits, loadDeposits]);

  async function handleLogout() {
    await fetch("/api/cashier/auth/logout", { method: "POST" });
    router.push("/cashier/login");
  }

  if (error) {
    return <main style={{ padding: 24, textAlign: "center", color: "var(--danger)" }}>{error}</main>;
  }

  return (
    <>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } } * { box-sizing: border-box; }`}</style>
      <main style={{ minHeight: "100vh", background: "var(--background)", padding: "20px 16px 60px" }}>
        <div style={{ maxWidth: 560, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "var(--foreground)" }}>{me ? me.fullName : "…"}</div>
              <div style={{ fontSize: 12.5, color: "var(--muted-foreground)" }}>{me?.phone}</div>
            </div>
            <button
              onClick={handleLogout}
              style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 500, color: "var(--muted-foreground)", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 9, padding: "8px 12px", cursor: "pointer" }}
            >
              <LogOut size={14} /> Sign out
            </button>
          </div>

          <p style={{ fontSize: 13.5, color: "var(--muted-foreground)", marginBottom: 18 }}>
            {deposits && deposits[0] ? fmtDate(deposits[0].date) : ""}
          </p>

          {!deposits && (
            <div style={{ textAlign: "center", padding: 40, color: "var(--muted-foreground)" }}>
              <Loader2 size={20} style={{ animation: "spin 1s linear infinite" }} />
            </div>
          )}

          {deposits && deposits.length === 0 && (
            <div style={{ ...cardStyle, textAlign: "center", color: "var(--muted-foreground)" }}>
              You aren&apos;t currently assigned to any terminal. Contact your administrator.
            </div>
          )}

          <div style={{ display: "grid", gap: 14 }}>
            {deposits?.map((d) => (
              <div key={d.id} style={cardStyle}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 15.5, fontWeight: 600, color: "var(--foreground)" }}>{d.terminal?.name ?? "Terminal"}</div>
                    <div style={{ fontSize: 13, color: "var(--muted-foreground)", marginTop: 2 }}>
                      Expected: <strong style={{ color: "var(--foreground)" }}>{fmtETB(d.expectedAmount)}</strong>
                    </div>
                  </div>
                  <StatusBadge status={d.status} />
                </div>

                {(d.status === "VERIFIED_OK" || d.status === "VERIFIED_MISMATCH" || d.status === "RESOLVED") && d.verifiedAmount !== null && (
                  <div style={{ marginTop: 10, fontSize: 13, color: "var(--muted-foreground)" }}>
                    Verified amount: <strong style={{ color: "var(--foreground)" }}>{fmtETB(d.verifiedAmount)}</strong>
                    {d.discrepancyAmount !== null && (
                      <span style={{ color: "var(--danger)", marginLeft: 8 }}>
                        ({d.discrepancyAmount > 0 ? "+" : ""}{fmtETB(d.discrepancyAmount)} vs expected)
                      </span>
                    )}
                  </div>
                )}

                {d.status === "FAILED" && d.verifyErrorMessage && (
                  <div style={{ marginTop: 10, fontSize: 12.5, color: "var(--danger)" }}>{d.verifyErrorMessage}</div>
                )}

                {(d.status === "AWAITING_SUBMISSION" || d.status === "FAILED") && (
                  <SubmitForm deposit={d} onSubmitted={loadDeposits} />
                )}
              </div>
            ))}
          </div>

          <div style={{ textAlign: "center", marginTop: 28 }}>
            <a href="/cashier/change-pin" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--muted-foreground)" }}>
              <KeyRound size={13} /> Change PIN
            </a>
          </div>
        </div>
      </main>
    </>
  );
}
