"use client";

import { useRouter } from "next/navigation";
import { Lock, Loader2, AlertCircle } from "lucide-react";
import { useState, useRef, useEffect } from "react";

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
  fontSize: "16px",
  color: "var(--foreground)",
  width: "100%",
  minWidth: 0,
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

export default function CashierLoginPage() {
  const router = useRouter();

  const [phone, setPhone] = useState("");
  const [phoneFocused, setPhoneFocused] = useState(false);
  const [pin, setPin] = useState("");
  const [pinFocused, setPinFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pinInputRef = useRef<HTMLInputElement>(null);
  const phoneValid = phone.length === 9 && /^[79]/.test(phone);

  useEffect(() => {
    if (phoneValid) pinInputRef.current?.focus();
  }, [phoneValid]);

  function lockedMessage(e: ApiError) {
    if (!e.lockedUntil) return e.message;
    const until = new Date(e.lockedUntil).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    return `${e.message} Try again after ${until}.`;
  }

  async function handleLogin() {
    if (!phoneValid || pin.length !== 4 || loading) return;
    setLoading(true); setError(null);
    try {
      await apiFetch("/api/cashier/auth/login", { phone: `+251${phone}`, pin });
      router.push("/cashier");
    } catch (e) {
      setError(e instanceof ApiError ? lockedMessage(e) : "Sign-in failed. Try again.");
      setPin("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        * { box-sizing: border-box; }
      `}</style>

      <main style={{ background: "var(--background)", minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px 16px" }}>
        <div style={{ width: "100%", maxWidth: "400px" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, marginBottom: 36 }}>
            <div
              aria-hidden="true"
              style={{
                width: 60, height: 60, borderRadius: 16,
                background: "var(--primary)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 22, fontWeight: 800, color: "#ffffff", letterSpacing: "-0.02em",
                boxShadow: "0 6px 20px color-mix(in srgb, var(--primary) 35%, transparent)",
              }}
            >
              OD
            </div>
            <div style={{ textAlign: "center", lineHeight: 1 }}>
              <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: "0.14em", color: "var(--foreground)" }}>CASHIER PORTAL</div>
              <div style={{ fontSize: 11, letterSpacing: "0.06em", color: "var(--muted-foreground)", marginTop: 4 }}>Daily deposit reporting</div>
            </div>
          </div>

          <div style={cardStyle}>
            <div style={{ textAlign: "center", marginBottom: 26 }}>
              <h1 style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.01em", color: "var(--foreground)", margin: "0 0 8px" }}>
                Sign in
              </h1>
              <p style={{ fontSize: 14, color: "var(--muted-foreground)", lineHeight: 1.55, margin: 0 }}>
                Enter your phone number and PIN.
              </p>
            </div>

            {error && <ErrorBanner message={error} />}

            <div style={{ marginBottom: 18 }}>
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
                  onFocus={() => setPhoneFocused(true)}
                  onBlur={() => setPhoneFocused(false)}
                  autoFocus
                  style={baseInputStyle}
                />
              </div>
            </div>

            <div style={{ marginBottom: 8 }}>
              <label style={labelStyle}>4-digit PIN</label>
              <div style={wrapStyle(pinFocused)}>
                <input
                  ref={pinInputRef}
                  type="password" inputMode="numeric" maxLength={4}
                  value={pin}
                  onChange={e => { setPin(e.target.value.replace(/\D/g, "")); setError(null); }}
                  onKeyDown={e => e.key === "Enter" && handleLogin()}
                  onFocus={() => setPinFocused(true)}
                  onBlur={() => setPinFocused(false)}
                  style={{ ...baseInputStyle, letterSpacing: "0.5em", fontFamily: "monospace" }}
                  placeholder="••••"
                />
              </div>
            </div>

            <p style={{ fontSize: 12, color: "var(--muted-foreground)", marginBottom: 20 }}>
              No PIN yet, or forgot it? Ask your administrator.
            </p>

            <button onClick={handleLogin} disabled={!phoneValid || pin.length !== 4 || loading} style={primaryBtn(phoneValid && pin.length === 4 && !loading)}>
              {loading ? <Spinner /> : <Lock size={16} strokeWidth={2.2} />}
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </div>

          <p style={{ marginTop: 28, textAlign: "center", fontSize: 12, color: "var(--muted-foreground)" }}>
            OroDashboard · powered by{" "}
            <span style={{ fontWeight: 600, color: "var(--foreground)" }}>BS Tech Digital</span>
          </p>
        </div>
      </main>
    </>
  );
}
