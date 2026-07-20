// src/app/api/ota/employees/filter-options/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/api-auth";
import { ok, serverError } from "@/lib/api-utils";

/**
 * GET /api/ota/employees/filter-options
 * Distinct roles seen among already-synced employees — used both as a filter
 * dropdown and as role choices when creating a new employee (OTA has no
 * "list all valid roles" endpoint, so this is built from what's actually on
 * file for this company).
 */
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, "ota-employees", "view");
  if ("error" in auth) return auth.error;

  try {
    const roles = await prisma.otaEmployee.findMany({
      where: { roleName: { not: null } },
      distinct: ["roleName"],
      select: { roleName: true, roleLabel: true },
      orderBy: { roleName: "asc" },
    });

    return ok({
      roles: roles
        .filter((r): r is { roleName: string; roleLabel: string | null } => Boolean(r.roleName))
        .map((r) => ({ name: r.roleName, label: r.roleLabel ?? r.roleName })),
    });
  } catch (error) {
    return serverError(error);
  }
}
