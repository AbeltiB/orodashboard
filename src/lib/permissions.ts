// src/lib/permissions.ts
import { z } from "zod";
import type { $Enums } from "@/generated/prisma/client";

// Source of truth for per-page dashboard permissions — mirrors src/lib/navigation.ts.
export const PERMISSION_PAGES = [
  { page: "dashboard", label: "Dashboard" },
  { page: "stations", label: "Stations" },
  { page: "terminals", label: "Terminals" },
  { page: "employees", label: "Employees" },
  { page: "pos-machines", label: "POS Machines" },
  { page: "fare-matrix", label: "Fare Price Matrix" },
  { page: "reports", label: "Reports" },
  { page: "settings", label: "Settings" },
] as const;

export type PermissionPage = (typeof PERMISSION_PAGES)[number]["page"];

export const ADMIN_ROLE_VALUES = ["SUPER_ADMIN", "ADMIN", "VIEWER"] as const;

export const ADMIN_ROLE_LABELS: Record<$Enums.AdminRole, string> = {
  SUPER_ADMIN: "Super Admin",
  ADMIN: "Admin",
  VIEWER: "Viewer",
};

const PERMISSION_PAGE_VALUES = PERMISSION_PAGES.map((p) => p.page) as [PermissionPage, ...PermissionPage[]];

export const pagePermissionSchema = z.object({
  page: z.enum(PERMISSION_PAGE_VALUES),
  canView: z.boolean(),
  canEdit: z.boolean(),
});

export const permissionsSchema = z.array(pagePermissionSchema);

export type PagePermission = z.infer<typeof pagePermissionSchema>;

// Every page, full access — used to seed the super admin.
export function fullPermissions(): PagePermission[] {
  return PERMISSION_PAGES.map((p) => ({ page: p.page, canView: true, canEdit: true }));
}

// Sensible starting point when a new admin is created — role gates the defaults,
// an actual super admin can still fine-tune per-page after creation.
export function defaultPermissionsForRole(role: $Enums.AdminRole): PagePermission[] {
  return PERMISSION_PAGES.map((p) => ({
    page: p.page,
    canView: role === "VIEWER" ? p.page !== "settings" : true,
    canEdit: role === "SUPER_ADMIN" || (role === "ADMIN" && p.page !== "settings"),
  }));
}

export function hasPermission(
  permissions: unknown,
  page: PermissionPage,
  action: "view" | "edit"
): boolean {
  const parsed = permissionsSchema.safeParse(permissions);
  if (!parsed.success) return false;
  const entry = parsed.data.find((p) => p.page === page);
  if (!entry) return false;
  return action === "view" ? entry.canView : entry.canEdit;
}
