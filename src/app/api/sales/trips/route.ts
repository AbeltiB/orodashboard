// src/app/api/sales/trips/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/api-auth";
import { ok, parsePagination, serializeSalesTrip, serverError } from "@/lib/api-utils";
import { buildSalesTripWhere } from "@/lib/ota/sales-filters";

export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, "sales", "view");
  if ("error" in auth) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const { offset, limit } = parsePagination(searchParams, 50, 500);
    const where = buildSalesTripWhere(searchParams);

    const [trips, total, aggregate] = await Promise.all([
      // Newest first, down to the millisecond — the source can log several
      // trips within the same second, so date alone isn't enough to keep
      // this stable; id is a tiebreaker only, the real ordering is date desc.
      prisma.salesTrip.findMany({ where, orderBy: [{ date: "desc" }, { id: "desc" }], skip: offset, take: limit }),
      prisma.salesTrip.count({ where }),
      prisma.salesTrip.aggregate({
        where,
        _sum: { tariff: true, serviceCharge: true, totalServiceCharge: true, distanceKm: true, passengers: true },
      }),
    ]);

    return ok({
      data: trips.map(serializeSalesTrip),
      meta: { total, offset, limit, hasMore: offset + trips.length < total },
      totals: {
        tariff: aggregate._sum.tariff?.toNumber() ?? 0,
        serviceCharge: aggregate._sum.serviceCharge?.toNumber() ?? 0,
        totalServiceCharge: aggregate._sum.totalServiceCharge?.toNumber() ?? 0,
        distanceKm: aggregate._sum.distanceKm?.toNumber() ?? 0,
        passengers: aggregate._sum.passengers ?? 0,
      },
    });
  } catch (error) {
    return serverError(error);
  }
}
