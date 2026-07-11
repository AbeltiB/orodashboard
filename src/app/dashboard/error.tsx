"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Dashboard error:", error);
  }, [error]);

  return (
    <div style={{ minHeight: "60vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: 24, textAlign: "center" }}>
      <AlertTriangle size={32} color="#dc2626" />
      <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--foreground)", margin: 0 }}>Something went wrong</h2>
      <p style={{ fontSize: 13, color: "var(--muted-foreground)", maxWidth: 420, margin: 0 }}>
        {error.message || "An unexpected error occurred while loading this page."}
      </p>
      <button
        onClick={reset}
        style={{ height: 38, padding: "0 18px", borderRadius: 9, border: "none", background: "var(--primary)", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 7 }}
      >
        <RotateCcw size={14} /> Try again
      </button>
    </div>
  );
}
