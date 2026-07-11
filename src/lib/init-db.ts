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
  await seedSuperAdmin();
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
    { key: "app_name",               value: "OroDashboard", description: "Application display name" },
    { key: "timezone",               value: "Africa/Addis_Ababa", description: "Timezone used for timestamps and date displays" },
    { key: "currency",               value: "ETB", description: "Default currency for fare and salary display" },
    { key: "date_format",            value: "DD/MM/YYYY", description: "How dates are displayed across the system" },
    { key: "notif_pos_outdated",     value: "true",  description: "Alert when a POS machine is not on the latest app version" },
    { key: "notif_pos_unassigned",   value: "true",  description: "Alert when an active POS has no operator assigned" },
    { key: "notif_station_no_staff", value: "true",  description: "Alert when a station has zero employees assigned" },
    { key: "notif_failed_logins",    value: "true",  description: "Notify when an account is locked after failed OTP attempts" },
    { key: "notif_petty_cash_high",  value: "false", description: "Alert when a single petty cash disbursement exceeds a threshold" },
    { key: "notif_new_user_login",   value: "false", description: "Notify when a new admin logs in for the first time" },
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

/**
 * Seeds the initial super admin from env vars if no admin with that phone
 * number exists yet. Idempotent — never overwrites an existing row, so this
 * is safe to leave running on every boot; only the very first boot matters.
 */
async function seedSuperAdmin(): Promise<void> {
  const phone = process.env.SUPER_ADMIN_PHONE;
  const firstName = process.env.SUPER_ADMIN_FIRST_NAME;
  const lastName = process.env.SUPER_ADMIN_LAST_NAME;
  if (!phone || !firstName || !lastName) {
    console.warn(
      "⚠ SUPER_ADMIN_PHONE / SUPER_ADMIN_FIRST_NAME / SUPER_ADMIN_LAST_NAME not set — skipping super admin seed."
    );
    return;
  }

  const { prisma } = await import("./prisma");
  const { fullPermissions } = await import("./permissions");

  await prisma.adminUser
    .upsert({
      where: { phone },
      create: {
        phone,
        firstName,
        middleName: process.env.SUPER_ADMIN_MIDDLE_NAME || null,
        lastName,
        role: "SUPER_ADMIN",
        isActive: true,
        permissions: fullPermissions(),
      },
      update: {}, // never overwrite — the super admin manages themselves from here
    })
    .catch((error) => {
      console.error("Failed to seed super admin:", error);
    });
}