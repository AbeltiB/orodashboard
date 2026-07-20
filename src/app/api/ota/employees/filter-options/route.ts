// src/app/api/ota/employees/filter-options/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/api-auth";
import { ok, serverError } from "@/lib/api-utils";

/**
 * GET /api/ota/employees/filter-options
 * Distinct roles seen among already-synced employees, plus a lightweight
 * terminal list — used both as filter dropdowns and as choices when creating
 * a new employee (OTA has no "list all valid roles" endpoint, so roles are
 * built from what's actually on file for this company; terminals come from
 * the separately-synced nationwide OtaTerminal mirror).
 */
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, "ota-employees", "view");
  if ("error" in auth) return auth.error;

  try {
    const [roles, terminals] = await Promise.all([
      prisma.otaEmployee.findMany({
        where: { roleName: { not: null } },
        distinct: ["roleName"],
        select: { roleName: true, roleLabel: true },
        orderBy: { roleName: "asc" },
      }),
      prisma.otaTerminal.findMany({
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
    ]);

    return ok({
      roles: roles
        .filter((r): r is { roleName: string; roleLabel: string | null } => Boolean(r.roleName))
        .map((r) => ({ name: r.roleName, label: r.roleLabel ?? r.roleName })),
      terminals,
    });
  } catch (error) {
    return serverError(error);
  }
}
