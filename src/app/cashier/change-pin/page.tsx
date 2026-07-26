"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, KeyRound, Loader2 } from "lucide-react";

const inputStyle: React.CSSProperties = {
  width: "100%", height: 46, padding: "0 14px", borderRadius: 10,
  border: "1.5px solid var(--border)", background: "var(--surface)", fontSize: 15,
  color: "var(--foreground)", outline: "none", letterSpacing: "0.5em", fontFamily: "monospace",
};

export default function CashierChangePinPage() {
  const router = useRouter();
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const pinsMatch = newPin.length === 4 && newPin === confirmPin;
  const valid = currentPin.length === 4 && pinsMatch;

  async function handleSubmit() {
    if (!valid || loading) return;
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/cashier/auth/change-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPin, newPin }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message ?? "Failed to update PIN.");
      setSuccess(true);
      setTimeout(() => router.push("/cashier"), 1200);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update PIN.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } } * { box-sizing: border-box; }`}</style>
      <main style={{ minHeight: "100vh", background: "var(--background)", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 16px" }}>
        <div style={{ width: "100%", maxWidth: 380 }}>
          <button
            onClick={() => router.push("/cashier")}
            style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--muted-foreground)", background: "none", border: "none", cursor: "pointer", marginBottom: 16, padding: 0 }}
          >
            <ArrowLeft size={14} /> Back
          </button>

          <div style={{ padding: "28px 26px", borderRadius: 16, background: "var(--surface)", border: "1px solid var(--border)" }}>
            <h1 style={{ fontSize: 19, fontWeight: 700, color: "var(--foreground)", margin: "0 0 20px" }}>Change PIN</h1>

            {error && (
              <div style={{ fontSize: 12.5, color: "var(--danger)", background: "var(--danger-bg)", padding: "8px 10px", borderRadius: 8, marginBottom: 14 }}>{error}</div>
            )}
            {success && (
              <div style={{ fontSize: 12.5, color: "var(--success)", background: "var(--success-bg)", padding: "8px 10px", borderRadius: 8, marginBottom: 14 }}>PIN updated.</div>
            )}

            <div style={{ display: "grid", gap: 14 }}>
              <div>
                <label style={{ fontSize: 12.5, fontWeight: 500, color: "var(--muted-foreground)", display: "block", marginBottom: 6 }}>Current PIN</label>
                <input type="password" inputMode="numeric" maxLength={4} value={currentPin} onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, ""))} style={inputStyle} placeholder="••••" />
              </div>
              <div>
                <label style={{ fontSize: 12.5, fontWeight: 500, color: "var(--muted-foreground)", display: "block", marginBottom: 6 }}>New PIN</label>
                <input type="password" inputMode="numeric" maxLength={4} value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))} style={inputStyle} placeholder="••••" />
              </div>
              <div>
                <label style={{ fontSize: 12.5, fontWeight: 500, color: "var(--muted-foreground)", display: "block", marginBottom: 6 }}>Confirm new PIN</label>
                <input type="password" inputMode="numeric" maxLength={4} value={confirmPin} onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ""))} style={inputStyle} placeholder="••••" />
                {confirmPin.length === 4 && !pinsMatch && (
                  <p style={{ fontSize: 12, color: "var(--danger)", marginTop: 6 }}>PINs don&apos;t match.</p>
                )}
              </div>

              <button
                onClick={handleSubmit}
                disabled={!valid || loading}
                style={{
                  height: 46, borderRadius: 10, border: "none", marginTop: 6,
                  background: valid && !loading ? "var(--primary)" : "color-mix(in srgb, var(--primary) 52%, #94a3b8)",
                  color: "#fff", fontSize: 14.5, fontWeight: 600, cursor: valid ? "pointer" : "default",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                }}
              >
                {loading ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> : <KeyRound size={16} />}
                {loading ? "Saving…" : "Save PIN"}
              </button>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
