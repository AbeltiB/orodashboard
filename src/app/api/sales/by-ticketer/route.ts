// src/app/api/sales/by-ticketer/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/api-auth";
import { ok, serverError } from "@/lib/api-utils";
import { buildSalesTripWhere } from "@/lib/ota/sales-filters";

/**
 * GET /api/sales/by-ticketer
 * Earnings per ticketer (employee), grouped and summed at the DB level.
 * Accepts the same filters as /api/sales/trips (dateFrom/dateTo,
 * departureTerminal, arrivalTerminal, employeeId, plateNo, search) so the
 * Sales page's filter bar drives both views identically. Sorted by total
 * collected, highest first. Already unpaginated — every matching ticketer
 * row comes back in one response, so this doubles as the "By ticketer"
 * view's own export source.
 */
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, "sales", "view");
  if ("error" in auth) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const where = buildSalesTripWhere(searchParams);
    // Exclude trips with no employee attached from the grouping — but only
    // when the caller didn't already ask for one specific employeeId,
    // otherwise this would silently widen the filter back out to everyone.
    if (!where.employeeExternalId) where.employeeExternalId = { not: null };

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
