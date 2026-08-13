// src/app/api/cashier/sales/by-route/[route]/breakdown/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { requireCashierAuth } from "@/lib/cashier-auth";
import { badRequest, forbidden, ok, serverError } from "@/lib/api-utils";
import { assertCashierOwnsStation, getCashierStationMatchNames } from "@/lib/cashier-sales-scope";

type Context = { params: Promise<{ route: string }> };

type RawRow = {
  day: Date;
  trips: bigint;
  passengers: bigint;
  tariff: Prisma.Decimal;
  totalServiceCharge: Prisma.Decimal;
};

/**
 * GET /api/cashier/sales/by-route/:route/breakdown
 * One destination route's trips grouped by day, scoped to one of the
 * cashier's assigned stations, across every ticketer who worked it — the
 * day-by-day sales/service-charge reconciliation view for a single route.
 */
export async function GET(request: NextRequest, context: Context) {
  const auth = await requireCashierAuth(request);
  if ("error" in auth) return auth.error;

  try {
    const { route } = await context.params;
    if (!route) return badRequest("route is required.");

    const { searchParams } = new URL(request.url);
    const stationId = searchParams.get("stationId")?.trim();
    if (!stationId) return badRequest("stationId query param is required.");
    if (!(await assertCashierOwnsStation(auth.session.employeeId, stationId))) {
      return forbidden("You aren't assigned to this station.");
    }

    const matchNames = await getCashierStationMatchNames(auth.session.employeeId, stationId);
    if (matchNames.length === 0) return ok({ data: [] });

    const dateFrom = searchParams.get("dateFrom")?.trim() || null;
    const dateTo = searchParams.get("dateTo")?.trim() || null;

    const rows = await prisma.$queryRaw<RawRow[]>`
      SELECT
        date_trunc('day', "date") as day,
        COUNT(*)::bigint as trips,
        SUM("passengers")::bigint as passengers,
        SUM("tariff") as tariff,
        SUM("totalServiceCharge") as "totalServiceCharge"
      FROM "sales_trips"
      WHERE "arrivalTerminalName" = ${route}
        AND "departureTerminalName" = ANY(${matchNames})
        AND (${dateFrom}::timestamp IS NULL OR "date" >= ${dateFrom}::timestamp)
        AND (${dateTo}::timestamp IS NULL OR "date" < ${dateTo}::timestamp + interval '1 day')
      GROUP BY day
      ORDER BY day DESC
    `;

    const data = rows.map((r) => {
      const tariff = r.tariff.toNumber();
      const totalServiceCharge = r.totalServiceCharge.toNumber();
      return {
        date: r.day.toISOString().slice(0, 10),
        trips: Number(r.trips),
        passengers: Number(r.passengers),
        tariff,
        totalServiceCharge,
        totalCollected: tariff + totalServiceCharge,
      };
    });

    return ok({ data });
  } catch (error) {
    return serverError(error);
  }
}
