// src/app/api/cashier/sales/by-ticketer/[employeeId]/breakdown/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { requireCashierAuth } from "@/lib/cashier-auth";
import { badRequest, forbidden, ok, serverError } from "@/lib/api-utils";
import { assertCashierOwnsStation, getCashierStationMatchNames } from "@/lib/cashier-sales-scope";

type Context = { params: Promise<{ employeeId: string }> };

type RawRow = {
  day: string;
  departureTerminalName: string;
  arrivalTerminalName: string;
  trips: bigint;
  passengers: bigint;
  distanceKm: Prisma.Decimal;
  tariff: Prisma.Decimal;
  totalServiceCharge: Prisma.Decimal;
};

/**
 * GET /api/cashier/sales/by-ticketer/:employeeId/breakdown
 * One ticketer's trips grouped by day x route, scoped to one of the
 * cashier's assigned stations — powers the weekly/monthly/all-time
 * reconciliation drill-down, including looking up someone who no longer
 * works there (omit dateFrom/dateTo entirely for all time).
 */
export async function GET(request: NextRequest, context: Context) {
  const auth = await requireCashierAuth(request);
  if ("error" in auth) return auth.error;

  try {
    const { employeeId } = await context.params;
    if (!employeeId) return badRequest("employeeId is required.");

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
    const arrivalTerminal = searchParams.get("arrivalTerminal")?.trim() || null;

    const rows = await prisma.$queryRaw<RawRow[]>`
      SELECT
        to_char(date_trunc('day', "date"), 'YYYY-MM-DD') as day,
        "departureTerminalName",
        "arrivalTerminalName",
        COUNT(*)::bigint as trips,
        SUM("passengers")::bigint as passengers,
        SUM("distanceKm") as "distanceKm",
        SUM("tariff") as tariff,
        SUM("totalServiceCharge") as "totalServiceCharge"
      FROM "sales_trips"
      WHERE "employeeExternalId" = ${employeeId}
        AND "departureTerminalName" = ANY(${matchNames})
        AND (${dateFrom}::timestamp IS NULL OR "date" >= ${dateFrom}::timestamp)
        AND (${dateTo}::timestamp IS NULL OR "date" < ${dateTo}::timestamp + interval '1 day')
        AND (${arrivalTerminal}::text IS NULL OR "arrivalTerminalName" = ${arrivalTerminal}::text)
      GROUP BY day, "departureTerminalName", "arrivalTerminalName"
      ORDER BY day DESC, "arrivalTerminalName" ASC
    `;

    const data = rows.map((r) => {
      const tariff = r.tariff.toNumber();
      const totalServiceCharge = r.totalServiceCharge.toNumber();
      return {
        date: r.day,
        departureTerminalName: r.departureTerminalName,
        arrivalTerminalName: r.arrivalTerminalName,
        trips: Number(r.trips),
        passengers: Number(r.passengers),
        distanceKm: r.distanceKm.toNumber(),
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
