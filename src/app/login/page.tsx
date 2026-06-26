"use client";

import { useRouter } from "next/navigation";
import { KeyRound } from "lucide-react";
import { useState, useRef, useEffect } from "react";

type Step = "phone" | "pin";

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const pinRef = useRef<HTMLInputElement>(null);

  const phoneValid = phone.length === 9 && /^[79]/.test(phone);
  const pinValid   = pin.length === 6;

  // Auto-focus PIN input when step changes
  useEffect(() => {
    if (step === "pin") pinRef.current?.focus();
  }, [step]);

  function handleContinue() {
    if (phoneValid) setStep("pin");
  }

  function handleSignIn() {
    if (pinValid) router.push("/dashboard");
  }

  // ── shared styles ────────────────────────────────────────────
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

  const inputStyle: React.CSSProperties = {
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

  function btnStyle(active: boolean): React.CSSProperties {
    return {
      width: "100%",
      height: "48px",
      borderRadius: "12px",
      background: active
        ? "var(--primary)"
        : "color-mix(in srgb, var(--primary) 52%, #94a3b8)",
      color: "#ffffff",
      fontSize: "15px",
      fontWeight: 600,
      letterSpacing: "0.01em",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "8px",
      cursor: active ? "pointer" : "default",
      border: "none",
      transition: "background 0.18s ease",
    };
  }

  function inputWrapStyle(focused?: boolean): React.CSSProperties {
    return {
      display: "flex",
      border: `1.5px solid ${focused ? "var(--primary)" : "var(--border)"}`,
      borderRadius: "12px",
      overflow: "hidden",
      background: "var(--surface)",
      boxShadow: focused
        ? "0 0 0 3px color-mix(in srgb, var(--primary) 12%, transparent)"
        : "none",
    };
  }

  // ── logo (shared) ────────────────────────────────────────────
  const Logo = (
    <div className="mb-10 flex flex-col items-center gap-3">
      {/*
        Replace SVG with your real logo:
        <Image src="/adrash-logo.png" alt="Adrash" width={96} height={96} priority />
      */}
      <svg width="88" height="88" viewBox="0 0 88 88" fill="none" aria-hidden="true">
        <polygon points="44,6 82,78 6,78" fill="#1d4ed8" />
        <line x1="44" y1="14" x2="44" y2="72" stroke="white" strokeWidth="3.5" strokeLinecap="round"/>
        <line x1="44" y1="28" x2="28" y2="72" stroke="white" strokeWidth="3"   strokeLinecap="round" opacity="0.6"/>
        <line x1="44" y1="28" x2="60" y2="72" stroke="white" strokeWidth="3"   strokeLinecap="round" opacity="0.6"/>
        <circle cx="44" cy="7" r="5" fill="white"/>
      </svg>

      <div className="flex flex-col items-center leading-none">
        <span style={{ fontSize: "26px", fontWeight: 700, letterSpacing: "0.18em", color: "var(--foreground)" }}>
          Oro-Ticket Dashboard
        </span>
        <span style={{ fontSize: "11px", letterSpacing: "0.06em", color: "var(--muted-foreground)", marginTop: "4px" }}>
          Custom Built for BS Technologies
        </span>
      </div>
    </div>
  );

  // ── footer (shared) ──────────────────────────────────────────
  const Footer = (
    <p style={{ marginTop: "28px", textAlign: "center", fontSize: "12px", color: "var(--muted-foreground)" }}>
      Oro-Ticket Dashboard · powered by{" "}
      <span style={{ fontWeight: 600, color: "var(--foreground)" }}>BS Technologies</span>
    </p>
  );

  return (
    <main
      style={{ background: "var(--background)" }}
      className="flex min-h-screen flex-col items-center justify-center px-4"
    >
      <div className="w-full max-w-[420px]">
        {Logo}

        {/* ══════════════════════════════════════
            STEP 1 — Phone number
        ══════════════════════════════════════ */}
        {step === "phone" && (
          <div style={cardStyle}>
            {/* Heading */}
            <div className="mb-8 text-center">
              <h1 style={{ fontSize: "22px", fontWeight: 700, letterSpacing: "-0.01em", color: "var(--foreground)", marginBottom: "8px" }}>
                Admin sign in
              </h1>
              <p style={{ fontSize: "14px", color: "var(--muted-foreground)", lineHeight: 1.5 }}>
                Enter your phone — we&apos;ll ask for your PIN next.
              </p>
            </div>

            {/* Phone input */}
            <div style={{ marginBottom: "24px" }}>
              <label htmlFor="phone" style={labelStyle}>Phone number</label>

              <div style={inputWrapStyle(true)}>
                <div style={{
                  display: "flex", alignItems: "center", padding: "0 14px",
                  borderRight: "1.5px solid var(--border)", fontSize: "14px",
                  fontWeight: 500, color: "var(--muted-foreground)", whiteSpace: "nowrap", userSelect: "none",
                }}>
                  ET +251
                </div>
                <input
                  id="phone"
                  type="tel"
                  inputMode="numeric"
                  maxLength={9}
                  placeholder="9XXXXXXXX or 7XXXXXXXX"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                  onKeyDown={(e) => e.key === "Enter" && handleContinue()}
                  autoFocus
                  style={inputStyle}
                />
              </div>

              <p style={{ fontSize: "12px", color: "var(--muted-foreground)", marginTop: "6px" }}>
                9 digits, no leading zero
              </p>
            </div>

            {/* CTA */}
            <button
              onClick={handleContinue}
              style={btnStyle(phoneValid)}
              onMouseEnter={(e) => { if (phoneValid) (e.currentTarget as HTMLButtonElement).style.background = "var(--primary-hover)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = phoneValid ? "var(--primary)" : "color-mix(in srgb, var(--primary) 52%, #94a3b8)"; }}
            >
              <KeyRound size={17} strokeWidth={2.2} />
              Continue with PIN
            </button>

            {/* OTP */}
            <button
              style={{ display: "block", width: "100%", marginTop: "16px", fontSize: "13.5px", color: "var(--primary)", background: "none", border: "none", cursor: "pointer", textAlign: "center", fontWeight: 500 }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.textDecoration = "underline")}
              onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.textDecoration = "none")}
            >
              Use OTP instead
            </button>
          </div>
        )}

        {/* ══════════════════════════════════════
            STEP 2 — PIN entry
        ══════════════════════════════════════ */}
        {step === "pin" && (
          <div style={cardStyle}>
            {/* Heading */}
            <div className="mb-8 text-center">
              <h1 style={{ fontSize: "22px", fontWeight: 700, letterSpacing: "-0.01em", color: "var(--foreground)", marginBottom: "8px" }}>
                Admin sign in
              </h1>
              <p style={{ fontSize: "14px", color: "var(--primary)", lineHeight: 1.5 }}>
                Enter your 6-digit PIN.
              </p>
            </div>

            {/* "Signing in as" row */}
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "20px",
            }}>
              <span style={{ fontSize: "14px", color: "var(--muted-foreground)" }}>
                Signing in as{" "}
                <span style={{ fontWeight: 600, color: "var(--foreground)" }}>
                  +251{phone}
                </span>
              </span>
              <button
                onClick={() => { setStep("phone"); setPin(""); }}
                style={{
                  fontSize: "13px",
                  color: "var(--primary)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontWeight: 500,
                  display: "flex",
                  alignItems: "center",
                  gap: "3px",
                  padding: 0,
                }}
              >
                ← change
              </button>
            </div>

            {/* PIN input */}
            <div style={{ marginBottom: "24px" }}>
              <label htmlFor="pin" style={labelStyle}>6-digit PIN</label>

              <div style={inputWrapStyle(false)}>
                <input
                  ref={pinRef}
                  id="pin"
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder=""
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                  onKeyDown={(e) => e.key === "Enter" && handleSignIn()}
                  style={{ ...inputStyle, letterSpacing: pin.length ? "0.3em" : "0", justifyContent: "center", textAlign: "center" }}
                />
              </div>
            </div>

            {/* Sign in CTA */}
            <button
              onClick={handleSignIn}
              style={btnStyle(pinValid)}
              onMouseEnter={(e) => { if (pinValid) (e.currentTarget as HTMLButtonElement).style.background = "var(--primary-hover)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = pinValid ? "var(--primary)" : "color-mix(in srgb, var(--primary) 52%, #94a3b8)"; }}
            >
              Sign in
            </button>

            {/* Forgot PIN / OTP */}
            <button
              style={{ display: "block", width: "100%", marginTop: "16px", fontSize: "13.5px", color: "var(--primary)", background: "none", border: "none", cursor: "pointer", textAlign: "center", fontWeight: 500 }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.textDecoration = "underline")}
              onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.textDecoration = "none")}
            >
              Forgot PIN? Sign in with OTP
            </button>
          </div>
        )}

        {Footer}
      </div>
    </main>
  );
}