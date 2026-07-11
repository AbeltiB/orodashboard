import { redirect } from "next/navigation";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { getSession } from "@/lib/session";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Real, DB-backed auth gate — src/proxy.ts only does an optimistic
  // cookie-presence check; this is the actual source of truth (catches
  // expired/revoked sessions even if the cookie is still present).
  const session = await getSession();
  if (!session) redirect("/login");

  return <DashboardShell user={session}>{children}</DashboardShell>;
}
