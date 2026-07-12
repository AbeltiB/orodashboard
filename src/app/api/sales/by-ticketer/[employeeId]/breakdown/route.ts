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
 *
 * The WHERE clause is intentionally static SQL text with nullable bound
 * parameters (`$n IS NULL OR ...`) rather than conditionally-composed
 * Prisma.sql fragments joined together — nesting Prisma.Sql fragments
 * inside another $queryRaw template isn't reliably flattened by this
 * Prisma version's driver-adapter path (it got serialized to a JSON string
 * and bound as a single parameter instead of spliced as raw SQL, which
 * Postgres then rejected). Plain scalar parameters, including null,
 * bind correctly, so that's what this uses throughout.
 */
export async function GET(request: NextRequest, context: Context) {
  const auth = await requirePermission(request, "sales", "view");
  if ("error" in auth) return auth.error;

  try {
    const { employeeId } = await context.params;
    if (!employeeId) return badRequest("employeeId is required.");

    const { searchParams } = new URL(request.url);
    const dateFrom = searchParams.get("dateFrom")?.trim() || null;
    const dateTo = searchParams.get("dateTo")?.trim() || null;
    const departureTerminal = searchParams.get("departureTerminal")?.trim() || null;
    const arrivalTerminal = searchParams.get("arrivalTerminal")?.trim() || null;
    const plateNo = searchParams.get("plateNo")?.trim();
    const search = searchParams.get("search")?.trim();

    const plateLike = plateNo ? `%${plateNo}%` : null;
    const searchLike = search ? `%${search}%` : null;

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
        AND (${dateFrom}::timestamp IS NULL OR "date" >= ${dateFrom}::timestamp)
        AND (${dateTo}::timestamp IS NULL OR "date" <= ${dateTo}::timestamp)
        AND (${departureTerminal}::text IS NULL OR "departureTerminalName" = ${departureTerminal}::text)
        AND (${arrivalTerminal}::text IS NULL OR "arrivalTerminalName" = ${arrivalTerminal}::text)
        AND (${plateLike}::text IS NULL OR "vehiclePlateNo" ILIKE ${plateLike}::text)
        AND (
          ${searchLike}::text IS NULL
          OR "employeeName" ILIKE ${searchLike}::text
          OR "departureTerminalName" ILIKE ${searchLike}::text
          OR "arrivalTerminalName" ILIKE ${searchLike}::text
          OR "vehiclePlateNo" ILIKE ${searchLike}::text
        )
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
