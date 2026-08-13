// src/app/api/cashiers/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/api-auth";
import { ok, serverError } from "@/lib/api-utils";

/**
 * GET /api/cashiers
 * Every employee with at least one terminal assignment (deposits) or station
 * assignment (sales reconciliation) — the admin "Cashiers" page's roster.
 * Employees with neither don't show up here; use GET /api/employees to find
 * someone to assign.
 */
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, "cashiers", "view");
  if ("error" in auth) return auth.error;

  try {
    const employees = await prisma.employee.findMany({
      where: {
        isDeleted: false,
        OR: [{ terminalAssignments: { some: {} } }, { stationAssignments: { some: {} } }],
      },
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
        stationAssignments: {
          orderBy: { assignedAt: "desc" },
          select: {
            id: true,
            isActive: true,
            assignedAt: true,
            station: { select: { id: true, name: true, code: true } },
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
        stationAssignments: e.stationAssignments.map((a) => ({
          id: a.id,
          isActive: a.isActive,
          assignedAt: a.assignedAt,
          station: a.station,
        })),
      })),
    });
  } catch (error) {
    return serverError(error);
  }
}
