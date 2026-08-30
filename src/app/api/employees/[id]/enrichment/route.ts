// src/app/api/employees/[id]/enrichment/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/api-auth";
import { notFound, ok, serverError, toNumber } from "@/lib/api-utils";

function normalizePhone(p: string): string {
  return p.replace(/\D/g, "").slice(-9);
}

/**
 * GET /api/employees/:id/enrichment
 * Matches this employee to OTA's own registry (phone-normalized — no
 * shared id exists between Employee and OtaEmployee) and, if matched,
 * pulls their real sales performance from sales_trips via
 * OtaEmployee.userId = SalesTrip.employeeExternalId (confirmed live: this
 * is a hard join, unlike the phone match above which is best-effort).
 */
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission(request, "employees", "view");
  if ("error" in auth) return auth.error;

  try {
    const { id } = await context.params;
    const employee = await prisma.employee.findUnique({ where: { id }, select: { id: true, phone: true } });
    if (!employee) return notFound("Employee");

    const normalized = normalizePhone(employee.phone);
    const otaEmployees = await prisma.otaEmployee.findMany({ where: { phone: { not: null } } });
    const otaMatch = otaEmployees.find((o) => o.phone && normalizePhone(o.phone) === normalized) ?? null;

    let salesPerformance = null;
    if (otaMatch) {
      const [aggregate, first, last] = await Promise.all([
        prisma.salesTrip.aggregate({
          where: { employeeExternalId: otaMatch.userId },
          _count: { _all: true },
          _sum: { tariff: true, totalServiceCharge: true, passengers: true },
        }),
        prisma.salesTrip.findFirst({ where: { employeeExternalId: otaMatch.userId }, orderBy: { date: "asc" }, select: { date: true } }),
        prisma.salesTrip.findFirst({ where: { employeeExternalId: otaMatch.userId }, orderBy: { date: "desc" }, select: { date: true, departureTerminalName: true } }),
      ]);

      if (aggregate._count._all > 0) {
        const tariff = toNumber(aggregate._sum.tariff ?? 0);
        const totalServiceCharge = toNumber(aggregate._sum.totalServiceCharge ?? 0);
        salesPerformance = {
          trips: aggregate._count._all,
          passengers: aggregate._sum.passengers ?? 0,
          revenue: tariff,
          totalServiceCharge,
          totalCollected: tariff + totalServiceCharge,
          firstTripDate: first?.date ?? null,
          lastTripDate: last?.date ?? null,
          lastStation: last?.departureTerminalName ?? null,
        };
      }
    }

    return ok({
      otaMatch: otaMatch
        ? {
            id: otaMatch.id,
            userId: otaMatch.userId,
            fullName: otaMatch.fullName,
            position: otaMatch.position,
            department: otaMatch.department,
            joiningDate: otaMatch.joiningDate,
            terminalName: otaMatch.terminalName,
            roleName: otaMatch.roleName,
            userStatus: otaMatch.userStatus,
            isActive: otaMatch.isActive,
          }
        : null,
      salesPerformance,
    });
  } catch (error) {
    return serverError(error);
  }
}
