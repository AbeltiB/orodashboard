import { RefreshCw } from "lucide-react";

export default function DashboardLoading() {
  return (
    <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted-foreground)" }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <RefreshCw size={18} style={{ marginRight: 8, animation: "spin 1s linear infinite" }} />
      Loading…
    </div>
  );
}
