// src/app/api/cashier/sales/by-route/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { requireCashierAuth } from "@/lib/cashier-auth";
import { badRequest, dateRangeFilter, forbidden, ok, serverError } from "@/lib/api-utils";
import { assertCashierOwnsStation, getCashierStationMatchNames } from "@/lib/cashier-sales-scope";

/**
 * GET /api/cashier/sales/by-route
 * Totals per destination route for one station, across every ticketer —
 * which routes brought in the most that period, independent of who worked
 * them. Same filters as by-ticketer minus the ticketer filter itself.
 */
export async function GET(request: NextRequest) {
  const auth = await requireCashierAuth(request);
  if ("error" in auth) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const stationId = searchParams.get("stationId")?.trim();
    if (!stationId) return badRequest("stationId query param is required.");
    if (!(await assertCashierOwnsStation(auth.session.employeeId, stationId))) {
      return forbidden("You aren't assigned to this station.");
    }

    const matchNames = await getCashierStationMatchNames(auth.session.employeeId, stationId);
    if (matchNames.length === 0) return ok({ data: [] });

    const dateFrom = searchParams.get("dateFrom")?.trim();
    const dateTo = searchParams.get("dateTo")?.trim();

    const where: Prisma.SalesTripWhereInput = { departureTerminalName: { in: matchNames } };
    const dateFilter = dateRangeFilter(dateFrom, dateTo);
    if (dateFilter) where.date = dateFilter;

    const grouped = await prisma.salesTrip.groupBy({
      by: ["arrivalTerminalName"],
      where,
      _count: { _all: true },
      _sum: { tariff: true, totalServiceCharge: true, passengers: true },
    });

    const rows = grouped
      .map((g) => {
        const tariff = g._sum.tariff?.toNumber() ?? 0;
        const totalServiceCharge = g._sum.totalServiceCharge?.toNumber() ?? 0;
        return {
          route: g.arrivalTerminalName,
          trips: g._count._all,
          passengers: g._sum.passengers ?? 0,
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
