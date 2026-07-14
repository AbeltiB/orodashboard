"use client";

import { useRouter } from "next/navigation";
import { KeyRound, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { useState, useRef, useEffect } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Step = "phone" | "otp_sent";

// ─── Helpers ──────────────────────────────────────────────────────────────────

class ApiError extends Error {
  lockedUntil?: string;
  constructor(message: string, lockedUntil?: string) {
    super(message);
    this.lockedUntil = lockedUntil;
  }
}

async function apiFetch<T>(path: string, body: object): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new ApiError(json?.message ?? json?.error ?? `Error ${res.status}`, json?.lockedUntil);
  }
  return json as T;
}

function maskPhone(phone: string) {
  return `+251 ${phone.slice(0, 2)}••••••${phone.slice(-1)}`;
}

// ─── Shared style factories ───────────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  padding: "40px 36px 36px",
  borderRadius: "18px",
  background: "var(--surface)",
  border: "1px solid var(--border)",
  boxShadow: "0 4px 24px rgb(0 0 0 / 0.06)",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "13px",
  fontWeight: 500,
  color: "var(--foreground)",
  marginBottom: "8px",
};

const baseInputStyle: React.CSSProperties = {
  flex: 1,
  height: "48px",
  padding: "0 16px",
  outline: "none",
  border: "none",
  background: "transparent",
  fontSize: "15px",
  color: "var(--foreground)",
  width: "100%",
};

function wrapStyle(focused: boolean): React.CSSProperties {
  return {
    display: "flex",
    border: `1.5px solid ${focused ? "var(--primary)" : "var(--border)"}`,
    borderRadius: "12px",
    overflow: "hidden",
    background: "var(--surface)",
    boxShadow: focused ? "0 0 0 3px color-mix(in srgb, var(--primary) 12%, transparent)" : "none",
    transition: "border-color 0.15s, box-shadow 0.15s",
  };
}

function primaryBtn(active: boolean): React.CSSProperties {
  return {
    width: "100%", height: "48px", borderRadius: "12px",
    background: active ? "var(--primary)" : "color-mix(in srgb, var(--primary) 52%, #94a3b8)",
    color: "#ffffff",
    fontSize: "15px", fontWeight: 600, letterSpacing: "0.01em",
    display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
    cursor: active ? "pointer" : "default",
    border: "none", transition: "background 0.18s ease, opacity 0.18s ease",
  };
}

function ghostBtn(): React.CSSProperties {
  return {
    display: "block", width: "100%", marginTop: "14px",
    fontSize: "13.5px", color: "var(--primary)",
    background: "none", border: "none", cursor: "pointer",
    textAlign: "center", fontWeight: 500,
  };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Spinner() {
  return <Loader2 size={17} style={{ animation: "spin 1s linear infinite" }} />;
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "10px 12px", background: "var(--danger-bg)", border: "1px solid color-mix(in srgb, var(--danger) 40%, transparent)", borderRadius: 10, marginBottom: 18 }}>
      <AlertCircle size={15} color="var(--danger)" style={{ flexShrink: 0, marginTop: 1 }} />
      <span style={{ fontSize: 13, color: "var(--danger)", lineHeight: 1.5 }}>{message}</span>
    </div>
  );
}

function SuccessBanner({ message }: { message: string }) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "10px 12px", background: "var(--success-bg)", border: "1px solid color-mix(in srgb, var(--success) 40%, transparent)", borderRadius: 10, marginBottom: 18 }}>
      <CheckCircle2 size={15} color="var(--success)" style={{ flexShrink: 0, marginTop: 1 }} />
      <span style={{ fontSize: 13, color: "var(--success)", lineHeight: 1.5 }}>{message}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN LOGIN PAGE
// ─────────────────────────────────────────────────────────────────────────────

export default function LoginPage() {
  const router = useRouter();

  // ── State ──────────────────────────────────────────────────────────────────
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [phoneFocused, setPhoneFocused] = useState(false);

  const [otpCode, setOtpCode] = useState("");
  const [otpFocused, setOtpFocused] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const otpInputRef = useRef<HTMLInputElement>(null);

  const phoneValid = phone.length === 9 && /^[79]/.test(phone);

  useEffect(() => {
    if (step === "otp_sent") otpInputRef.current?.focus();
  }, [step]);

  function lockedMessage(e: ApiError) {
    if (!e.lockedUntil) return e.message;
    const until = new Date(e.lockedUntil).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    return `${e.message} Try again after ${until}.`;
  }

  // ── Step 1 — request an OTP ────────────────────────────────────────────────

  async function handleSendOtp() {
    if (!phoneValid || loading) return;
    setLoading(true); setError(null); setSuccess(null);
    try {
      await apiFetch("/api/auth/otp/send", { phone: `+251${phone}` });
      setSuccess(`A 6-digit code was sent to ${maskPhone(phone)}.`);
      setStep("otp_sent");
      setOtpCode("");
    } catch (e) {
      setError(e instanceof ApiError ? lockedMessage(e) : "Failed to send OTP. Try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleResendOtp() {
    setLoading(true); setError(null); setSuccess(null);
    try {
      await apiFetch("/api/auth/otp/send", { phone: `+251${phone}` });
      setSuccess(`A new code was sent to ${maskPhone(phone)}.`);
      setOtpCode("");
    } catch (e) {
      setError(e instanceof ApiError ? lockedMessage(e) : "Failed to resend OTP. Try again.");
    } finally {
      setLoading(false);
    }
  }

  // ── Step 2 — verify the OTP and sign in ────────────────────────────────────

  async function handleVerifyOtp() {
    if (otpCode.length !== 6 || loading) return;
    setLoading(true); setError(null);
    try {
      await apiFetch("/api/auth/otp/verify", { phone: `+251${phone}`, otp: otpCode });
      router.push("/dashboard");
    } catch (e) {
      setError(e instanceof ApiError ? lockedMessage(e) : "Invalid or expired code.");
      setOtpCode("");
    } finally {
      setLoading(false);
    }
  }

  function goBack() {
    setStep("phone");
    setOtpCode("");
    setError(null); setSuccess(null);
  }

  // ── Shared header ──────────────────────────────────────────────────────────

  const STEP_META: Record<Step, { title: string; sub: string }> = {
    phone: { title: "Admin sign in", sub: "Enter your registered phone number — we'll text you a code." },
    otp_sent: { title: "Check your phone", sub: `Enter the 6-digit code sent to ${maskPhone(phone)}.` },
  };

  const meta = STEP_META[step];

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes slideUp { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
        * { box-sizing: border-box; }
      `}</style>

      <main style={{ background: "var(--background)", minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px 16px" }}>
        <div style={{ width: "100%", maxWidth: "420px" }}>

          {/* ── Logo — text-based wordmark, no external asset ── */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, marginBottom: 36 }}>
            <div
              aria-hidden="true"
              style={{
                width: 64, height: 64, borderRadius: 16,
                background: "var(--primary)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 24, fontWeight: 800, color: "#ffffff", letterSpacing: "-0.02em",
                boxShadow: "0 6px 20px color-mix(in srgb, var(--primary) 35%, transparent)",
              }}
            >
              OD
            </div>
            <div style={{ textAlign: "center", lineHeight: 1 }}>
              <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: "0.18em", color: "var(--foreground)" }}>ORODASHBOARD</div>
              <div style={{ fontSize: 11, letterSpacing: "0.06em", color: "var(--muted-foreground)", marginTop: 4 }}>Smart Mobility, Simple Life.</div>
            </div>
          </div>

          {/* ── Card ── */}
          <div style={{ ...cardStyle, animation: "slideUp 0.22s ease" }} key={step}>

            {/* Heading */}
            <div style={{ textAlign: "center", marginBottom: 28 }}>
              <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.01em", color: "var(--foreground)", margin: "0 0 8px" }}>
                {meta.title}
              </h1>
              <p style={{ fontSize: 14, color: "var(--muted-foreground)", lineHeight: 1.55, margin: 0 }}>
                {meta.sub}
              </p>
            </div>

            {/* Error / success banners */}
            {error && <ErrorBanner message={error} />}
            {success && <SuccessBanner message={success} />}

            {/* ── STEP: phone ── */}
            {step === "phone" && (
              <>
                <div style={{ marginBottom: 22 }}>
                  <label htmlFor="phone" style={labelStyle}>Phone number</label>
                  <div style={wrapStyle(phoneFocused)}>
                    <div style={{ display: "flex", alignItems: "center", padding: "0 14px", borderRight: "1.5px solid var(--border)", fontSize: 14, fontWeight: 500, color: "var(--muted-foreground)", whiteSpace: "nowrap", userSelect: "none" }}>
                      ET +251
                    </div>
                    <input
                      id="phone" type="tel" inputMode="numeric" maxLength={9}
                      placeholder="9XXXXXXXX or 7XXXXXXXX"
                      value={phone}
                      onChange={e => { setPhone(e.target.value.replace(/\D/g, "")); setError(null); }}
                      onKeyDown={e => e.key === "Enter" && handleSendOtp()}
                      onFocus={() => setPhoneFocused(true)}
                      onBlur={() => setPhoneFocused(false)}
                      autoFocus
                      style={baseInputStyle}
                    />
                  </div>
                  <p style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 6 }}>9 digits, no leading zero</p>
                </div>

                <button onClick={handleSendOtp} disabled={!phoneValid || loading} style={primaryBtn(phoneValid && !loading)}>
                  {loading ? <Spinner /> : <KeyRound size={17} strokeWidth={2.2} />}
                  {loading ? "Sending…" : "Send code"}
                </button>
              </>
            )}

            {/* ── STEP: otp_sent ── */}
            {step === "otp_sent" && (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, padding: "10px 12px", background: "var(--background)", borderRadius: 9, border: "1px solid var(--border)" }}>
                  <span style={{ fontSize: 13, color: "var(--muted-foreground)" }}>
                    Signing in as <strong style={{ color: "var(--foreground)" }}>+251{phone}</strong>
                  </span>
                  <button onClick={goBack} style={{ fontSize: 12, color: "var(--primary)", background: "none", border: "none", cursor: "pointer", fontWeight: 600, padding: 0 }}>
                    ← change
                  </button>
                </div>

                <label style={labelStyle}>6-digit code</label>
                <div style={wrapStyle(otpFocused)}>
                  <input
                    ref={otpInputRef}
                    type="text" inputMode="numeric" maxLength={6}
                    value={otpCode}
                    onChange={e => { setOtpCode(e.target.value.replace(/\D/g, "")); setError(null); }}
                    onKeyDown={e => e.key === "Enter" && otpCode.length === 6 && handleVerifyOtp()}
                    onFocus={() => setOtpFocused(true)}
                    onBlur={() => setOtpFocused(false)}
                    style={{ ...baseInputStyle, letterSpacing: "0.35em", fontFamily: "monospace" }}
                    placeholder="••••••"
                  />
                </div>
                <p style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 6, marginBottom: 20 }}>
                  Code expires in 5 minutes.
                </p>

                <button onClick={handleVerifyOtp} disabled={otpCode.length !== 6 || loading} style={primaryBtn(otpCode.length === 6 && !loading)}>
                  {loading ? <Spinner /> : null}
                  {loading ? "Verifying…" : "Verify & sign in"}
                </button>

                <button style={ghostBtn()} onClick={handleResendOtp} disabled={loading}>
                  Resend code
                </button>
                <button style={{ ...ghostBtn(), color: "var(--muted-foreground)", marginTop: 6 }} onClick={goBack}>
                  ← Back to phone
                </button>
              </>
            )}
          </div>

          {/* ── Footer ── */}
          <p style={{ marginTop: 28, textAlign: "center", fontSize: 12, color: "var(--muted-foreground)" }}>
            OroDashboard Admin · powered by{" "}
            <span style={{ fontWeight: 600, color: "var(--foreground)" }}>BS Tech Digital</span>
          </p>
        </div>
      </main>
    </>
  );
}
