// src/app/api/cashier/sales/filter-options/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCashierAuth } from "@/lib/cashier-auth";
import { ok, serverError } from "@/lib/api-utils";
import { getCashierAssignedStations, getCashierStationMatchNames } from "@/lib/cashier-sales-scope";

/**
 * GET /api/cashier/sales/filter-options
 * Ticketers and routes within the signed-in cashier's own station scope —
 * so their filter pickers only ever show people/places relevant to them.
 */
export async function GET(request: NextRequest) {
  const auth = await requireCashierAuth(request);
  if ("error" in auth) return auth.error;

  try {
    const [stations, matchNames] = await Promise.all([
      getCashierAssignedStations(auth.session.employeeId),
      getCashierStationMatchNames(auth.session.employeeId),
    ]);

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
