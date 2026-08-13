// src/app/api/cashier/sales/by-ticketer/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { requireCashierAuth } from "@/lib/cashier-auth";
import { dateRangeFilter, ok, serverError } from "@/lib/api-utils";
import { getCashierStationMatchNames } from "@/lib/cashier-sales-scope";

/**
 * GET /api/cashier/sales/by-ticketer
 * Earnings per ticketer, scoped to the signed-in cashier's assigned
 * station(s) only — the core "how much do I collect from this person"
 * view. Query params: dateFrom, dateTo, employeeId, arrivalTerminal (route).
 */
export async function GET(request: NextRequest) {
  const auth = await requireCashierAuth(request);
  if ("error" in auth) return auth.error;

  try {
    const matchNames = await getCashierStationMatchNames(auth.session.employeeId);
    if (matchNames.length === 0) {
      return ok({ data: [], scope: { stations: [] } });
    }

    const { searchParams } = new URL(request.url);
    const dateFrom = searchParams.get("dateFrom")?.trim();
    const dateTo = searchParams.get("dateTo")?.trim();
    const employeeId = searchParams.get("employeeId")?.trim();
    const arrivalTerminal = searchParams.get("arrivalTerminal")?.trim();

    const where: Prisma.SalesTripWhereInput = {
      departureTerminalName: { in: matchNames },
      employeeExternalId: employeeId || { not: null },
    };
    const dateFilter = dateRangeFilter(dateFrom, dateTo);
    if (dateFilter) where.date = dateFilter;
    if (arrivalTerminal) where.arrivalTerminalName = arrivalTerminal;

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
