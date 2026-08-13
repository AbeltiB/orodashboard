// src/app/api/cashier/sales/by-ticketer/[employeeId]/breakdown/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { requireCashierAuth } from "@/lib/cashier-auth";
import { badRequest, ok, serverError } from "@/lib/api-utils";
import { getCashierStationMatchNames } from "@/lib/cashier-sales-scope";

type Context = { params: Promise<{ employeeId: string }> };

type RawRow = {
  day: Date;
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
 * One ticketer's trips grouped by day x route, scoped to the cashier's
 * assigned station(s) — powers the weekly/monthly reconciliation drill-down.
 * See the admin equivalent (src/app/api/sales/by-ticketer/[employeeId]/breakdown)
 * for the rationale on plain-parameter raw SQL over composed Sql fragments.
 */
export async function GET(request: NextRequest, context: Context) {
  const auth = await requireCashierAuth(request);
  if ("error" in auth) return auth.error;

  try {
    const { employeeId } = await context.params;
    if (!employeeId) return badRequest("employeeId is required.");

    const matchNames = await getCashierStationMatchNames(auth.session.employeeId);
    if (matchNames.length === 0) return ok({ data: [] });

    const { searchParams } = new URL(request.url);
    const dateFrom = searchParams.get("dateFrom")?.trim() || null;
    const dateTo = searchParams.get("dateTo")?.trim() || null;
    const arrivalTerminal = searchParams.get("arrivalTerminal")?.trim() || null;

    const rows = await prisma.$queryRaw<RawRow[]>`
      SELECT
        date_trunc('day', "date") as day,
        "departureTerminalName",
        "arrivalTerminalName",
        COUNT(*)::bigint as trips,
        SUM("passengers")::bigint as passengers,
        SUM("distanceKm") as "distanceKm",
        SUM("tariff") as tariff,
        SUM("totalServiceCharge") as "totalServiceCharge"
      FROM "sales_trips"
      WHERE "employeeExternalId" = ${employeeId}
        AND "departureTerminalName" IN (${Prisma.join(matchNames)})
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
        date: r.day.toISOString().slice(0, 10),
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
