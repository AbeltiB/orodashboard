import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

import { initializeDatabase } from "@/lib/init-db";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: {
    default: "OroDashboard",
    template: "%s | OroDashboard",
  },
  description: "OroDashboard Administration Dashboard",
  applicationName: "OroDashboard",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  await initializeDatabase();
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.variable} min-h-screen bg-[var(--background)] text-[var(--foreground)] antialiased`}
      >
        {children}
      </body>
    </html>
  );
}