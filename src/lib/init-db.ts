// src/lib/init-db.ts
import { connectDatabase } from "./db";

let initialized = false;

/**
 * Called once from the root layout on server start.
 * Guards against re-running on hot-reload in development.
 */
export async function initializeDatabase(): Promise<void> {
  if (initialized) return;
  initialized = true;
  await connectDatabase();
  await seedDefaultConfig();
}

/**
 * Seeds essential SystemConfig entries if they don't yet exist.
 * These are the keys the application expects to find at runtime.
 */
async function seedDefaultConfig(): Promise<void> {
  // Import lazily to avoid loading Prisma at module parse time
  const { prisma } = await import("./prisma");

  const defaults = [
    { key: "pos_latest_app_version", value: "ORO Ticket v2.4.1", description: "Current POS app version — used to flag outdated machines" },
    { key: "company_name",           value: "BS Tech Digital", description: "Company display name" },
    { key: "support_phone",          value: "+251911000000", description: "Support contact number" },
    { key: "ticket_receipt_footer",  value: "Thank you for travelling with BS Tech Digital!", description: "Footer text printed on tickets" },
  ];

  await Promise.all(
    defaults.map((d) =>
      prisma.systemConfig
        .upsert({
          where: { key: d.key },
          create: d,
          update: {}, // never overwrite user-edited values
        })
        .catch(() => {
          // Non-fatal — table might not exist yet during first migration
        })
    )
  );
}