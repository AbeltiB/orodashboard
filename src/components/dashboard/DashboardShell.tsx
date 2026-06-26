"use client";

import { useState } from "react";
import Sidebar from "./Sidebar";
import Header from "./Header";
import MobileSidebar from "./MobileSidebar";

export default function DashboardShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-[var(--background)]">
      {/* Desktop Sidebar */}
      <Sidebar
        collapsed={collapsed}
        setCollapsed={setCollapsed}
      />

      {/* Mobile Sidebar */}
      <MobileSidebar
        open={mobileOpen}
        setOpen={setMobileOpen}
      />

      {/* Main Content */}
      <div className="flex min-w-0 flex-1 flex-col">
        <Header
          collapsed={collapsed}
          setCollapsed={setCollapsed}
          setMobileOpen={setMobileOpen}
        />

        <main className="flex-1 p-6">
          {children}
        </main>
      </div>
    </div>
  );
}