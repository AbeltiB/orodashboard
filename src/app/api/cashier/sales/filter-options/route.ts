// src/app/api/cashier/sales/filter-options/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCashierAuth } from "@/lib/cashier-auth";
import { forbidden, ok, serverError } from "@/lib/api-utils";
import { assertCashierOwnsStation, getCashierAssignedStations, getCashierStationMatchNames } from "@/lib/cashier-sales-scope";

/**
 * GET /api/cashier/sales/filter-options?stationId=...
 * Ticketers and routes within one of the signed-in cashier's stations —
 * deliberately NOT date-scoped, so a ticketer who worked there in the past
 * but doesn't currently show up in the by-ticketer list can still be found
 * and looked up (see the "all time" range option on the Sales page).
 */
export async function GET(request: NextRequest) {
  const auth = await requireCashierAuth(request);
  if ("error" in auth) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const stationId = searchParams.get("stationId")?.trim();

    const stations = await getCashierAssignedStations(auth.session.employeeId);

    if (!stationId) {
      return ok({ stations, employees: [], arrivalTerminals: [] });
    }
    if (!(await assertCashierOwnsStation(auth.session.employeeId, stationId))) {
      return forbidden("You aren't assigned to this station.");
    }

    const matchNames = await getCashierStationMatchNames(auth.session.employeeId, stationId);
    if (matchNames.length === 0) {
      return ok({ stations, employees: [], arrivalTerminals: [] });
    }

    const [employees, arrivals] = await Promise.all([
      prisma.salesTrip.findMany({
        where: { departureTerminalName: { in: matchNames }, employeeExternalId: { not: null } },
        distinct: ["employeeExternalId"],
        select: { employeeExternalId: true, employeeName: true },
        orderBy: { employeeName: "asc" },
      }),
      prisma.salesTrip.findMany({
        where: { departureTerminalName: { in: matchNames } },
        distinct: ["arrivalTerminalName"],
        select: { arrivalTerminalName: true },
        orderBy: { arrivalTerminalName: "asc" },
      }),
    ]);

    return ok({
      stations,
      employees: employees
        .filter((e) => e.employeeExternalId)
        .map((e) => ({ id: e.employeeExternalId as string, name: e.employeeName ?? "Unknown" })),
      arrivalTerminals: arrivals.map((a) => a.arrivalTerminalName).filter(Boolean),
    });
  } catch (error) {
    return serverError(error);
  }
}
