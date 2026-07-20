// src/app/api/ota/vehicles/filter-options/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/api-auth";
import { ok, serverError } from "@/lib/api-utils";

/**
 * GET /api/ota/vehicles/filter-options
 * Distinct values to populate the Vehicles page's filter dropdowns.
 */
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, "ota-vehicles", "view");
  if ("error" in auth) return auth.error;

  try {
    const [associations, fleetTypes, departures, arrivals] = await Promise.all([
      prisma.otaVehicle.findMany({ where: { associationName: { not: null } }, distinct: ["associationName"], select: { associationName: true }, orderBy: { associationName: "asc" } }),
      prisma.otaVehicle.findMany({ where: { fleetTypeName: { not: null } }, distinct: ["fleetTypeName"], select: { fleetTypeName: true }, orderBy: { fleetTypeName: "asc" } }),
      prisma.otaVehicle.findMany({ where: { departureTerminalName: { not: null } }, distinct: ["departureTerminalName"], select: { departureTerminalName: true }, orderBy: { departureTerminalName: "asc" } }),
      prisma.otaVehicle.findMany({ where: { arrivalTerminalName: { not: null } }, distinct: ["arrivalTerminalName"], select: { arrivalTerminalName: true }, orderBy: { arrivalTerminalName: "asc" } }),
    ]);

    return ok({
      associations: associations.map((a) => a.associationName).filter((v): v is string => Boolean(v)),
      fleetTypes: fleetTypes.map((f) => f.fleetTypeName).filter((v): v is string => Boolean(v)),
      departureTerminals: departures.map((d) => d.departureTerminalName).filter((v): v is string => Boolean(v)),
      arrivalTerminals: arrivals.map((a) => a.arrivalTerminalName).filter((v): v is string => Boolean(v)),
    });
  } catch (error) {
    return serverError(error);
  }
}
