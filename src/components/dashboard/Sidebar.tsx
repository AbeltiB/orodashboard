"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import clsx from "clsx";
import { navigation } from "@/lib/navigation";

interface SidebarProps {
  collapsed: boolean;
  setCollapsed: (value: boolean) => void;
}

export default function Sidebar({
  collapsed,
  setCollapsed,
}: SidebarProps) {
  const pathname = usePathname();

  return (
    <>
      {/* Desktop Sidebar */}
      <aside
        className={clsx(
          "sidebar hidden lg:flex flex-col border-r transition-all duration-300",
          collapsed ? "w-20" : "w-72"
        )}
      >
        {/* Logo */}
        <div className="flex h-16 items-center justify-between border-b px-4">
          {!collapsed && (
            <div>
              <h1 className="text-xl font-bold">
                ORO Dashboard
              </h1>
            </div>
          )}

          <button
            onClick={() => setCollapsed(!collapsed)}
            className="rounded-lg p-2 hover:bg-[var(--hover)]"
          >
            {collapsed ? (
              <PanelLeftOpen size={18} />
            ) : (
              <PanelLeftClose size={18} />
            )}
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-2 p-4">
          {navigation.map((item) => {
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  "sidebar-item",
                  pathname === item.href && "active"
                )}
              >
                <Icon size={20} />

                {!collapsed && (
                  <span>{item.title}</span>
                )}
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}