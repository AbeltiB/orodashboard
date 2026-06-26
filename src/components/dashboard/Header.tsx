/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useEffect, useRef, useState } from "react";
import {
  Bell,
  Menu,
  Moon,
  Sun,
  Search,
  LogOut,
} from "lucide-react";
import { useRouter } from "next/navigation";

interface HeaderProps {
  collapsed: boolean;
  setCollapsed: (value: boolean) => void;
  setMobileOpen: (value: boolean) => void;
}

export default function Header({
  setMobileOpen,
}: HeaderProps) {
  const router = useRouter();

  const [profileOpen, setProfileOpen] =
    useState(false);

  const [darkMode, setDarkMode] =
    useState(false);

  const dropdownRef =
    useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(
      event: MouseEvent
    ) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(
          event.target as Node
        )
      ) {
        setProfileOpen(false);
      }
    }

    document.addEventListener(
      "mousedown",
      handleClickOutside
    );

    return () =>
      document.removeEventListener(
        "mousedown",
        handleClickOutside
      );
  }, []);

  // Load saved theme
  useEffect(() => {
    const savedTheme =
      localStorage.getItem("theme");

    if (savedTheme === "dark") {
      document.documentElement.classList.add(
        "dark"
      );
      setDarkMode(true);
    }
  }, []);

  // Toggle theme
  function toggleTheme() {
    const html = document.documentElement;

    if (darkMode) {
      html.classList.remove("dark");
      localStorage.setItem("theme", "light");
    } else {
      html.classList.add("dark");
      localStorage.setItem("theme", "dark");
    }

    setDarkMode(!darkMode);
  }

  function handleLogout() {
    router.push("/login");
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b bg-[var(--surface)] px-6">
      {/* Left */}
      <div className="flex items-center gap-3">
        <button
          className="lg:hidden"
          onClick={() => setMobileOpen(true)}
        >
          <Menu />
        </button>

        <div className="relative hidden md:block">
          <Search
            className="absolute left-3 top-3 text-gray-400"
            size={18}
          />

          <input
            placeholder="Search..."
            className="input w-80 pl-10"
          />
        </div>
      </div>

      {/* Right */}
      <div className="flex items-center gap-3">
        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          className="rounded-lg p-2 transition hover:bg-[var(--hover)]"
        >
          {darkMode ? (
            <Sun size={20} />
          ) : (
            <Moon size={20} />
          )}
        </button>

        {/* Notifications */}
        <button className="rounded-lg p-2 transition hover:bg-[var(--hover)]">
          <Bell size={20} />
        </button>

        {/* Profile */}
        <div
          className="relative"
          ref={dropdownRef}
        >
          <button
            onClick={() =>
              setProfileOpen(!profileOpen)
            }
            className="flex items-center gap-3 rounded-xl p-2 transition hover:bg-[var(--hover)]"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--primary)] font-medium text-white">
              AB
            </div>

            <div className="hidden text-left md:block">
              <p className="font-medium">
                Abelti Beshana
              </p>

              <p className="text-sm text-[var(--muted-foreground)]">
                Administrator
              </p>
            </div>
          </button>

          {/* Dropdown */}
          {profileOpen && (
            <div className="absolute right-0 top-16 z-50 w-72 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-xl">
              <div className="border-b p-4">
                <h3 className="font-semibold">
                  Abelti Beshana
                </h3>

                <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                  +251980232577
                </p>

                <p className="text-sm text-[var(--muted-foreground)]">
                  abelti@example.com
                </p>
              </div>

              <div className="p-3">
                <button
                  onClick={handleLogout}
                  className="flex w-full items-center gap-3 rounded-xl bg-red-50 px-4 py-3 text-red-600 transition hover:bg-red-100"
                >
                  <LogOut size={18} />
                  Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}