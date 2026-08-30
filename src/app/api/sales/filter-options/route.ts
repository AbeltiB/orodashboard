// src/app/api/sales/filter-options/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/api-auth";
import { ok, serverError } from "@/lib/api-utils";
import { getCanonicalDepartureTerminals } from "@/lib/telegram/reports";

/**
 * GET /api/sales/filter-options
 * Distinct values to populate the Sales page's filter dropdowns, so filters
 * are pick-from-a-list (exact match) rather than free-text guessing.
 */
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, "sales", "view");
  if ("error" in auth) return auth.error;

  try {
    const [departures, canonicalTerminals, arrivals, employees, companies, associations, fleetCategories, levels] = await Promise.all([
      prisma.salesTrip.findMany({
        distinct: ["departureTerminalName"],
        select: { departureTerminalName: true },
        orderBy: { departureTerminalName: "asc" },
      }),
      // All 16 of our OTA-registered departure terminals — unioned in below
      // so a terminal with zero sales_trips history so far (a new one, or a
      // quiet day) is still selectable, not just ones that already have rows.
      getCanonicalDepartureTerminals(),
      prisma.salesTrip.findMany({
        distinct: ["arrivalTerminalName"],
        select: { arrivalTerminalName: true },
        orderBy: { arrivalTerminalName: "asc" },
      }),
      prisma.salesTrip.findMany({
        where: { employeeExternalId: { not: null } },
        distinct: ["employeeExternalId"],
        select: { employeeExternalId: true, employeeName: true },
        orderBy: { employeeName: "asc" },
      }),
      prisma.salesTrip.findMany({
        distinct: ["companyName"],
        select: { companyName: true },
        orderBy: { companyName: "asc" },
      }),
      prisma.salesTrip.findMany({
        where: { vehicleAssociation: { not: null } },
        distinct: ["vehicleAssociation"],
        select: { vehicleAssociation: true },
        orderBy: { vehicleAssociation: "asc" },
      }),
      prisma.salesTrip.findMany({
        where: { vehicleFleetCategory: { not: null } },
        distinct: ["vehicleFleetCategory"],
        select: { vehicleFleetCategory: true },
        orderBy: { vehicleFleetCategory: "asc" },
      }),
      prisma.salesTrip.findMany({
        distinct: ["level"],
        select: { level: true },
        orderBy: { level: "asc" },
      }),
    ]);

    const departureTerminals = [...new Set([...departures.map((d) => d.departureTerminalName), ...canonicalTerminals])]
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));

    return ok({
      departureTerminals,
      arrivalTerminals: arrivals.map((a) => a.arrivalTerminalName).filter(Boolean),
      employees: employees
        .filter((e) => e.employeeExternalId)
        .map((e) => ({ id: e.employeeExternalId as string, name: e.employeeName ?? "Unknown" })),
      companies: companies.map((c) => c.companyName).filter(Boolean),
      vehicleAssociations: associations.map((a) => a.vehicleAssociation).filter((v): v is string => !!v),
      vehicleFleetCategories: fleetCategories.map((f) => f.vehicleFleetCategory).filter((v): v is string => !!v),
      levels: levels.map((l) => l.level).filter(Boolean),
    });
  } catch (error) {
    return serverError(error);
  }
}
