"use client";

import { usePathname, useRouter } from "next/navigation";
import { LogOut, KeyRound, TrendingUp, Wallet } from "lucide-react";

type Me = { fullName: string; phone: string } | null;

const TABS = [
  { href: "/cashier/sales", label: "Sales", icon: TrendingUp },
  { href: "/cashier/deposits", label: "Deposits", icon: Wallet },
] as const;

export default function PortalHeader({ me }: { me: Me }) {
  const router = useRouter();
  const pathname = usePathname();

  async function handleLogout() {
    await fetch("/api/cashier/auth/logout", { method: "POST" });
    router.push("/cashier/login");
  }

  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
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

      <div style={{ display: "flex", gap: 2, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 3 }}>
        {TABS.map((tab) => {
          const active = pathname?.startsWith(tab.href);
          const Icon = tab.icon;
          return (
            <button
              key={tab.href}
              onClick={() => router.push(tab.href)}
              style={{
                flex: 1, height: 36, borderRadius: 7, border: "none",
                background: active ? "var(--primary)" : "transparent",
                color: active ? "#fff" : "var(--muted-foreground)",
                fontSize: 13, fontWeight: active ? 700 : 500, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              }}
            >
              <Icon size={14} /> {tab.label}
            </button>
          );
        })}
      </div>

      <div style={{ textAlign: "center", marginTop: 14 }}>
        <a href="/cashier/change-pin" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--muted-foreground)" }}>
          <KeyRound size={12} /> Change PIN
        </a>
      </div>
    </div>
  );
}
