// src/app/api/cashiers/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/api-auth";
import { ok, serverError } from "@/lib/api-utils";

/**
 * GET /api/cashiers
 * Every employee with at least one terminal assignment (active or not) —
 * the admin "Cashiers" page's roster. Employees with zero assignments don't
 * show up here; use GET /api/employees to find someone to assign.
 */
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, "cashiers", "view");
  if ("error" in auth) return auth.error;

  try {
    const employees = await prisma.employee.findMany({
      where: { terminalAssignments: { some: {} }, isDeleted: false },
      select: {
        id: true,
        code: true,
        firstName: true,
        middleName: true,
        lastName: true,
        phone: true,
        role: true,
        cashierPinSetAt: true,
        cashierPinLockedUntil: true,
        terminalAssignments: {
          orderBy: { assignedAt: "desc" },
          select: {
            id: true,
            isActive: true,
            assignedAt: true,
            terminal: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return ok({
      data: employees.map((e) => ({
        id: e.id,
        code: e.code,
        name: [e.firstName, e.middleName, e.lastName].filter(Boolean).join(" "),
        phone: e.phone,
        role: e.role,
        hasPinSet: !!e.cashierPinSetAt,
        pinLockedUntil: e.cashierPinLockedUntil,
        assignments: e.terminalAssignments.map((a) => ({
          id: a.id,
          isActive: a.isActive,
          assignedAt: a.assignedAt,
          terminal: a.terminal,
        })),
      })),
    });
  } catch (error) {
    return serverError(error);
  }
}
