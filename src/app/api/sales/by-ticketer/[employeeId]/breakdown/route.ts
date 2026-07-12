// src/app/api/sales/by-ticketer/[employeeId]/breakdown/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { requirePermission } from "@/lib/api-auth";
import { badRequest, ok, serverError } from "@/lib/api-utils";

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
 * GET /api/sales/by-ticketer/:employeeId/breakdown
 * One ticketer's trips grouped by calendar day x route (both at once, in a
 * single query) — small enough per ticketer to send whole and let the
 * client re-slice it into "by route" and "by date" views, and expand any
 * date into the routes worked that day, without extra round-trips.
 * Accepts the same filters as /api/sales/trips.
 */
export async function GET(request: NextRequest, context: Context) {
  const auth = await requirePermission(request, "sales", "view");
  if ("error" in auth) return auth.error;

  try {
    const { employeeId } = await context.params;
    if (!employeeId) return badRequest("employeeId is required.");

    const { searchParams } = new URL(request.url);
    const dateFrom = searchParams.get("dateFrom")?.trim();
    const dateTo = searchParams.get("dateTo")?.trim();
    const departureTerminal = searchParams.get("departureTerminal")?.trim();
    const arrivalTerminal = searchParams.get("arrivalTerminal")?.trim();
    const plateNo = searchParams.get("plateNo")?.trim();
    const search = searchParams.get("search")?.trim();

    const conditions: Prisma.Sql[] = [Prisma.sql`"employeeExternalId" = ${employeeId}`];
    if (dateFrom) conditions.push(Prisma.sql`"date" >= ${new Date(dateFrom)}`);
    if (dateTo) conditions.push(Prisma.sql`"date" <= ${new Date(dateTo)}`);
    if (departureTerminal) conditions.push(Prisma.sql`"departureTerminalName" = ${departureTerminal}`);
    if (arrivalTerminal) conditions.push(Prisma.sql`"arrivalTerminalName" = ${arrivalTerminal}`);
    if (plateNo) conditions.push(Prisma.sql`"vehiclePlateNo" ILIKE ${`%${plateNo}%`}`);
    if (search) {
      const s = `%${search}%`;
      conditions.push(Prisma.sql`("employeeName" ILIKE ${s} OR "departureTerminalName" ILIKE ${s} OR "arrivalTerminalName" ILIKE ${s} OR "vehiclePlateNo" ILIKE ${s})`);
    }
    const where = Prisma.join(conditions, " AND ");

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
      WHERE ${where}
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
