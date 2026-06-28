"use client";

import { useRouter } from "next/navigation";
import { KeyRound, Eye, EyeOff, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { useState, useRef, useEffect, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

// What the API returns from POST /api/auth/check-phone
type PhoneCheckResult =
  | { status: "not_found" }
  | { status: "locked"; lockedUntil: string }
  | { status: "pin_not_set"; name: string | null }
  | { status: "pin_set"; name: string | null };

type Step =
  | "phone"          // Step 1 — enter phone
  | "set_pin"        // Step 2a — first login, create PIN
  | "confirm_pin"    // Step 2b — confirm the new PIN
  | "enter_pin"      // Step 2c — returning user, enter existing PIN
  | "otp_sent"       // OTP flow — code sent, waiting for input
  | "reset_pin"      // OTP verified, now set a new PIN
  | "confirm_reset"; // Confirm the reset PIN

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, body: object): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.message ?? json?.error ?? `Error ${res.status}`);
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

function primaryBtn(active: boolean, danger = false): React.CSSProperties {
  const bg = danger
    ? active ? "#dc2626" : "color-mix(in srgb, #dc2626 52%, #94a3b8)"
    : active ? "var(--primary)" : "color-mix(in srgb, var(--primary) 52%, #94a3b8)";
  return {
    width: "100%", height: "48px", borderRadius: "12px",
    background: bg, color: "#ffffff",
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
    <div style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "10px 12px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, marginBottom: 18 }}>
      <AlertCircle size={15} color="#dc2626" style={{ flexShrink: 0, marginTop: 1 }} />
      <span style={{ fontSize: 13, color: "#dc2626", lineHeight: 1.5 }}>{message}</span>
    </div>
  );
}

function SuccessBanner({ message }: { message: string }) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "10px 12px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, marginBottom: 18 }}>
      <CheckCircle2 size={15} color="#16a34a" style={{ flexShrink: 0, marginTop: 1 }} />
      <span style={{ fontSize: 13, color: "#16a34a", lineHeight: 1.5 }}>{message}</span>
    </div>
  );
}

// PIN dots — visual indicator (6 filled/empty circles)
function PinDots({ filled }: { filled: number }) {
  return (
    <div style={{ display: "flex", justifyContent: "center", gap: 10, margin: "8px 0 20px" }}>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} style={{
          width: 13, height: 13, borderRadius: "50%",
          background: i < filled ? "var(--primary)" : "var(--border)",
          transition: "background 0.15s ease",
          transform: i < filled ? "scale(1.15)" : "scale(1)",
        }} />
      ))}
    </div>
  );
}

// Masked PIN input (shows dots, numeric only)
function PinInput({ value, onChange, onSubmit, autoFocus = false }: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  autoFocus?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const [show, setShow] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => { if (autoFocus) ref.current?.focus(); }, [autoFocus]);

  return (
    <>
      <PinDots filled={value.length} />
      <div style={wrapStyle(focused)}>
        <input
          ref={ref}
          type={show ? "text" : "password"}
          inputMode="numeric"
          maxLength={6}
          value={value}
          onChange={e => onChange(e.target.value.replace(/\D/g, ""))}
          onKeyDown={e => e.key === "Enter" && value.length === 6 && onSubmit()}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{ ...baseInputStyle, letterSpacing: value.length ? "0.35em" : "0", fontFamily: "monospace" }}
          placeholder="••••••"
        />
        <button
          type="button"
          onClick={() => { setShow(v => !v); ref.current?.focus(); }}
          style={{ background: "none", border: "none", cursor: "pointer", padding: "0 14px", color: "var(--muted-foreground)", display: "flex", alignItems: "center" }}
        >
          {show ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN LOGIN PAGE
// ─────────────────────────────────────────────────────────────────────────────

export default function LoginPage() {
  const router = useRouter();

  // ── State ──────────────────────────────────────────────────────────────────
  const [step,        setStep]        = useState<Step>("phone");
  const [phone,       setPhone]       = useState("");
  const [phoneFocused,setPhoneFocused]= useState(false);
  const [userName,    setUserName]    = useState<string | null>(null);

  const [pin,         setPin]         = useState("");
  const [pinConfirm,  setPinConfirm]  = useState("");
  const [otpCode,     setOtpCode]     = useState("");
  const [otpFocused,  setOtpFocused]  = useState(false);

  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [success,  setSuccess]  = useState<string | null>(null);

  const phoneValid = phone.length === 9 && /^[79]/.test(phone);

  // ── Step 1 — check phone ───────────────────────────────────────────────────

  async function handleCheckPhone() {
    if (!phoneValid || loading) return;
    setLoading(true); setError(null);
    try {
      const res = await apiFetch<PhoneCheckResult>("/api/auth/check-phone", {
        phone: `+251${phone}`,
      });

      if (res.status === "not_found") {
        setError("This phone number is not registered. Contact your administrator.");
        return;
      }
      if (res.status === "locked") {
        const until = new Date(res.lockedUntil).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
        setError(`Account locked due to too many failed attempts. Try again after ${until}.`);
        return;
      }

      setUserName(res.name);

      if (res.status === "pin_not_set") {
        setStep("set_pin");
      } else {
        setStep("enter_pin");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  // ── Step 2a/b — set new PIN (first login or reset) ────────────────────────

  async function handleSetPin() {
    if (pin.length !== 6 || loading) return;
    setError(null);
    setStep(step === "reset_pin" ? "confirm_reset" : "confirm_pin");
    setPinConfirm("");
  }

  async function handleConfirmPin() {
    if (pinConfirm.length !== 6 || loading) return;
    if (pin !== pinConfirm) {
      setError("PINs don't match. Please try again.");
      setPinConfirm("");
      return;
    }
    setLoading(true); setError(null);

    const endpoint = step === "confirm_reset"
      ? "/api/auth/reset-pin"
      : "/api/auth/set-pin";

    try {
      await apiFetch(endpoint, { phone: `+251${phone}`, pin });
      // set-pin also logs the user in and sets the cookie
      if (step === "confirm_pin") {
        router.push("/dashboard");
      } else {
        setSuccess("PIN reset successfully. Signing you in…");
        await apiFetch("/api/auth/login", { phone: `+251${phone}`, pin });
        router.push("/dashboard");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save PIN. Try again.");
      setStep(step === "confirm_reset" ? "reset_pin" : "set_pin");
      setPin("");
    } finally {
      setLoading(false);
    }
  }

  // ── Step 2c — enter existing PIN ──────────────────────────────────────────

  async function handleLogin() {
    if (pin.length !== 6 || loading) return;
    setLoading(true); setError(null);
    try {
      await apiFetch("/api/auth/login", { phone: `+251${phone}`, pin });
      router.push("/dashboard");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Incorrect PIN. Please try again.");
      setPin("");
    } finally {
      setLoading(false);
    }
  }

  // ── OTP flow ───────────────────────────────────────────────────────────────

  async function handleSendOtp() {
    setLoading(true); setError(null); setSuccess(null);
    try {
      await apiFetch("/api/auth/otp/send", { phone: `+251${phone}` });
      setSuccess(`A 6-digit code was sent to ${maskPhone(phone)}.`);
      setStep("otp_sent");
      setOtpCode("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send OTP. Try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp() {
    if (otpCode.length !== 6 || loading) return;
    setLoading(true); setError(null);
    try {
      await apiFetch("/api/auth/otp/verify", { phone: `+251${phone}`, otp: otpCode });
      setStep("reset_pin");
      setPin("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid or expired code.");
      setOtpCode("");
    } finally {
      setLoading(false);
    }
  }

  // ── Reset to phone step ────────────────────────────────────────────────────

  function goBack() {
    setStep("phone");
    setPin(""); setPinConfirm(""); setOtpCode("");
    setError(null); setSuccess(null);
  }

  // ── Shared header ──────────────────────────────────────────────────────────

  const greeting = userName ? `Welcome${step === "enter_pin" ? " back" : ""}, ${userName.split(" ")[0]}` : null;

  const STEP_META: Record<Step, { title: string; sub: string }> = {
    phone:         { title: "Admin sign in",       sub: "Enter your phone — we'll ask for your PIN next." },
    set_pin:       { title: "Create your PIN",     sub: `${greeting ?? "First time here"}! Choose a 6-digit PIN to secure your account.` },
    confirm_pin:   { title: "Confirm your PIN",    sub: "Enter the same PIN again to confirm." },
    enter_pin:     { title: "Admin sign in",       sub: greeting ? `${greeting}. Enter your 6-digit PIN.` : "Enter your 6-digit PIN." },
    otp_sent:      { title: "Check your phone",    sub: `Enter the 6-digit code sent to ${maskPhone(phone)}.` },
    reset_pin:     { title: "Set a new PIN",       sub: "OTP verified. Choose your new 6-digit PIN." },
    confirm_reset: { title: "Confirm new PIN",     sub: "Enter the same PIN again to confirm." },
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

      <main style={{ background: "#ffffff", minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px 16px" }}>
        <div style={{ width: "100%", maxWidth: "420px" }}>

          {/* ── Logo ── */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, marginBottom: 36 }}>
            {/* Replace with <Image src="/adrash-logo.png" ... /> when available */}
            <svg width="80" height="80" viewBox="0 0 88 88" fill="none" aria-hidden="true">
              <polygon points="44,6 82,78 6,78" fill="#1d4ed8" />
              <line x1="44" y1="14" x2="44" y2="72" stroke="white" strokeWidth="3.5" strokeLinecap="round"/>
              <line x1="44" y1="28" x2="28" y2="72" stroke="white" strokeWidth="3" strokeLinecap="round" opacity="0.6"/>
              <line x1="44" y1="28" x2="60" y2="72" stroke="white" strokeWidth="3" strokeLinecap="round" opacity="0.6"/>
              <circle cx="44" cy="7" r="5" fill="white"/>
            </svg>
            <div style={{ textAlign: "center", lineHeight: 1 }}>
              <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: "0.18em", color: "#0f172a" }}>ADRĀSH</div>
              <div style={{ fontSize: 11, letterSpacing: "0.06em", color: "#64748b", marginTop: 4 }}>Smart Mobility, Simple Life.</div>
            </div>
          </div>

          {/* ── Card ── */}
          <div style={{ ...cardStyle, animation: "slideUp 0.22s ease" }} key={step}>

            {/* Heading */}
            <div style={{ textAlign: "center", marginBottom: 28 }}>
              <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.01em", color: "#0f172a", margin: "0 0 8px" }}>
                {meta.title}
              </h1>
              <p style={{ fontSize: 14, color: "#64748b", lineHeight: 1.55, margin: 0 }}>
                {meta.sub}
              </p>
            </div>

            {/* Error / success banners */}
            {error   && <ErrorBanner   message={error}   />}
            {success && <SuccessBanner message={success} />}

            {/* ── STEP: phone ── */}
            {step === "phone" && (
              <>
                <div style={{ marginBottom: 22 }}>
                  <label htmlFor="phone" style={labelStyle}>Phone number</label>
                  <div style={wrapStyle(phoneFocused)}>
                    <div style={{ display: "flex", alignItems: "center", padding: "0 14px", borderRight: "1.5px solid #e2e8f0", fontSize: 14, fontWeight: 500, color: "#64748b", whiteSpace: "nowrap", userSelect: "none" }}>
                      ET +251
                    </div>
                    <input
                      id="phone" type="tel" inputMode="numeric" maxLength={9}
                      placeholder="9XXXXXXXX or 7XXXXXXXX"
                      value={phone}
                      onChange={e => { setPhone(e.target.value.replace(/\D/g, "")); setError(null); }}
                      onKeyDown={e => e.key === "Enter" && handleCheckPhone()}
                      onFocus={() => setPhoneFocused(true)}
                      onBlur={() => setPhoneFocused(false)}
                      autoFocus
                      style={baseInputStyle}
                    />
                  </div>
                  <p style={{ fontSize: 12, color: "#64748b", marginTop: 6 }}>9 digits, no leading zero</p>
                </div>

                <button onClick={handleCheckPhone} disabled={!phoneValid || loading} style={primaryBtn(phoneValid && !loading)}>
                  {loading ? <Spinner /> : <KeyRound size={17} strokeWidth={2.2} />}
                  {loading ? "Checking…" : "Continue with PIN"}
                </button>

                <button style={ghostBtn()} onClick={handleSendOtp} disabled={!phoneValid || loading}>
                  Use OTP instead
                </button>
              </>
            )}

            {/* ── STEP: set_pin / reset_pin ── */}
            {(step === "set_pin" || step === "reset_pin") && (
              <>
                <label style={labelStyle}>Choose a 6-digit PIN</label>
                <PinInput value={pin} onChange={v => { setPin(v); setError(null); }} onSubmit={handleSetPin} autoFocus />

                <button onClick={handleSetPin} disabled={pin.length !== 6 || loading} style={primaryBtn(pin.length === 6 && !loading)}>
                  {loading ? <Spinner /> : null}
                  {loading ? "Saving…" : "Continue"}
                </button>
                <button style={ghostBtn()} onClick={goBack}>← Back to phone</button>
              </>
            )}

            {/* ── STEP: confirm_pin / confirm_reset ── */}
            {(step === "confirm_pin" || step === "confirm_reset") && (
              <>
                <label style={labelStyle}>Confirm your PIN</label>
                <PinInput value={pinConfirm} onChange={v => { setPinConfirm(v); setError(null); }} onSubmit={handleConfirmPin} autoFocus />

                <button onClick={handleConfirmPin} disabled={pinConfirm.length !== 6 || loading} style={primaryBtn(pinConfirm.length === 6 && !loading)}>
                  {loading ? <Spinner /> : null}
                  {loading ? "Saving PIN…" : step === "confirm_pin" ? "Create PIN & sign in" : "Confirm & sign in"}
                </button>
                <button style={ghostBtn()} onClick={() => { setStep(step === "confirm_reset" ? "reset_pin" : "set_pin"); setPinConfirm(""); setError(null); }}>
                  ← Re-enter PIN
                </button>
              </>
            )}

            {/* ── STEP: enter_pin ── */}
            {step === "enter_pin" && (
              <>
                {/* "Signing in as" row */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, padding: "10px 12px", background: "#f8fafc", borderRadius: 9, border: "1px solid #e2e8f0" }}>
                  <span style={{ fontSize: 13, color: "#64748b" }}>
                    Signing in as <strong style={{ color: "#0f172a" }}>+251{phone}</strong>
                  </span>
                  <button onClick={goBack} style={{ fontSize: 12, color: "#2563eb", background: "none", border: "none", cursor: "pointer", fontWeight: 600, padding: 0 }}>
                    ← change
                  </button>
                </div>

                <label style={labelStyle}>6-digit PIN</label>
                <PinInput value={pin} onChange={v => { setPin(v); setError(null); }} onSubmit={handleLogin} autoFocus />

                <button onClick={handleLogin} disabled={pin.length !== 6 || loading} style={primaryBtn(pin.length === 6 && !loading)}>
                  {loading ? <Spinner /> : <KeyRound size={17} strokeWidth={2.2} />}
                  {loading ? "Signing in…" : "Sign in"}
                </button>

                <button style={ghostBtn()} onClick={handleSendOtp} disabled={loading}>
                  Forgot PIN? Sign in with OTP
                </button>
              </>
            )}

            {/* ── STEP: otp_sent ── */}
            {step === "otp_sent" && (
              <>
                <label style={labelStyle}>6-digit OTP code</label>
                <div style={wrapStyle(otpFocused)}>
                  <input
                    type="text" inputMode="numeric" maxLength={6} autoFocus
                    value={otpCode}
                    onChange={e => { setOtpCode(e.target.value.replace(/\D/g, "")); setError(null); }}
                    onKeyDown={e => e.key === "Enter" && handleVerifyOtp()}
                    onFocus={() => setOtpFocused(true)}
                    onBlur={() => setOtpFocused(false)}
                    style={{ ...baseInputStyle, letterSpacing: "0.35em", fontFamily: "monospace" }}
                    placeholder="••••••"
                  />
                </div>
                <p style={{ fontSize: 12, color: "#64748b", marginTop: 6, marginBottom: 20 }}>
                  Code expires in 5 minutes.
                </p>

                <button onClick={handleVerifyOtp} disabled={otpCode.length !== 6 || loading} style={primaryBtn(otpCode.length === 6 && !loading)}>
                  {loading ? <Spinner /> : null}
                  {loading ? "Verifying…" : "Verify OTP"}
                </button>

                <button style={ghostBtn()} onClick={handleSendOtp} disabled={loading}>
                  Resend code
                </button>
                <button style={{ ...ghostBtn(), color: "#64748b", marginTop: 6 }} onClick={goBack}>
                  ← Back to phone
                </button>
              </>
            )}
          </div>

          {/* ── Footer ── */}
          <p style={{ marginTop: 28, textAlign: "center", fontSize: 12, color: "#94a3b8" }}>
            አድራሽ Admin · powered by{" "}
            <span style={{ fontWeight: 600, color: "#64748b" }}>BS Technologies</span>
          </p>
        </div>
      </main>
    </>
  );
}