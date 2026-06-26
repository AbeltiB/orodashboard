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
    default: "ORO Dashboard",
    template: "%s | ORO Dashboard",
  },
  description: "ORO Administration Dashboard",
  applicationName: "ORO Dashboard",
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