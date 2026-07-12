// src/app/api/sales/by-ticketer/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { requirePermission } from "@/lib/api-auth";
import { ok, serverError } from "@/lib/api-utils";

/**
 * GET /api/sales/by-ticketer
 * Earnings per ticketer (employee), grouped and summed at the DB level.
 * Accepts the same filters as /api/sales/trips (dateFrom/dateTo,
 * departureTerminal, arrivalTerminal, employeeId, plateNo, search) so the
 * Sales page's filter bar drives both views identically. Sorted by total
 * collected, highest first.
 */
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, "sales", "view");
  if ("error" in auth) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const dateFrom = searchParams.get("dateFrom")?.trim();
    const dateTo = searchParams.get("dateTo")?.trim();
    const departureTerminal = searchParams.get("departureTerminal")?.trim();
    const arrivalTerminal = searchParams.get("arrivalTerminal")?.trim();
    const employeeExternalId = searchParams.get("employeeId")?.trim();
    const plateNo = searchParams.get("plateNo")?.trim();
    const search = searchParams.get("search")?.trim();

    const where: Prisma.SalesTripWhereInput = { employeeExternalId: { not: null } };
    if (dateFrom || dateTo) {
      where.date = {
        ...(dateFrom && { gte: new Date(dateFrom) }),
        ...(dateTo && { lte: new Date(dateTo) }),
      };
    }
    if (departureTerminal) where.departureTerminalName = departureTerminal;
    if (arrivalTerminal) where.arrivalTerminalName = arrivalTerminal;
    if (employeeExternalId) where.employeeExternalId = employeeExternalId;
    if (plateNo) where.vehiclePlateNo = { contains: plateNo, mode: "insensitive" };
    if (search) {
      where.OR = [
        { employeeName: { contains: search, mode: "insensitive" } },
        { departureTerminalName: { contains: search, mode: "insensitive" } },
        { arrivalTerminalName: { contains: search, mode: "insensitive" } },
        { vehiclePlateNo: { contains: search, mode: "insensitive" } },
      ];
    }

    const grouped = await prisma.salesTrip.groupBy({
      by: ["employeeExternalId", "employeeName"],
      where,
      _count: { _all: true },
      _sum: { tariff: true, totalServiceCharge: true, distanceKm: true, passengers: true },
    });

    const rows = grouped
      .map((g) => {
        const tariff = g._sum.tariff?.toNumber() ?? 0;
        const totalServiceCharge = g._sum.totalServiceCharge?.toNumber() ?? 0;
        return {
          employeeId: g.employeeExternalId as string,
          employeeName: g.employeeName ?? "Unknown",
          trips: g._count._all,
          passengers: g._sum.passengers ?? 0,
          distanceKm: g._sum.distanceKm?.toNumber() ?? 0,
          tariff,
          totalServiceCharge,
          totalCollected: tariff + totalServiceCharge,
        };
      })
      .sort((a, b) => b.totalCollected - a.totalCollected);

    return ok({ data: rows });
  } catch (error) {
    return serverError(error);
  }
}
