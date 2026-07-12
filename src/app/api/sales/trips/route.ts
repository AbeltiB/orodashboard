// src/app/api/sales/trips/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { requirePermission } from "@/lib/api-auth";
import { ok, parsePagination, serializeSalesTrip, serverError } from "@/lib/api-utils";

export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, "sales", "view");
  if ("error" in auth) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const { offset, limit } = parsePagination(searchParams, 50, 500);

    const dateFrom = searchParams.get("dateFrom")?.trim();
    const dateTo = searchParams.get("dateTo")?.trim();
    const departureTerminal = searchParams.get("departureTerminal")?.trim();
    const arrivalTerminal = searchParams.get("arrivalTerminal")?.trim();
    const employeeExternalId = searchParams.get("employeeId")?.trim();
    const plateNo = searchParams.get("plateNo")?.trim();
    const search = searchParams.get("search")?.trim();

    const where: Prisma.SalesTripWhereInput = {};
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
