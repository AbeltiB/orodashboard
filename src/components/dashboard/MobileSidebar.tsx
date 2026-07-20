"use client";

import Link from "next/link";
import { X } from "lucide-react";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { navigation } from "@/lib/navigation";

interface MobileSidebarProps {
  open: boolean;
  setOpen: (value: boolean) => void;
}

export default function MobileSidebar({
  open,
  setOpen,
}: MobileSidebarProps) {
  const pathname = usePathname();

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50 lg:hidden"
        onClick={() => setOpen(false)}
      />

      {/* Sidebar */}
      <aside className="sidebar fixed left-0 top-0 z-50 flex h-screen w-72 flex-col p-4 lg:hidden">
        <div className="mb-8 flex flex-shrink-0 items-center justify-between">
          <h1 className="text-xl font-bold">
            OroDashboard
          </h1>

          <button
            onClick={() => setOpen(false)}
            aria-label="Close menu"
          >
            <X />
          </button>
        </div>

        <nav className="flex-1 space-y-2 overflow-y-auto">
          {navigation.map((item) => {
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={clsx(
                  "sidebar-item",
                  pathname === item.href && "active"
                )}
              >
                <Icon size={20} />
                <span>{item.title}</span>
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}