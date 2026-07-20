// src/app/api/ota/vehicles/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/api-auth";
import { ok, parsePagination, serializeOtaVehicle, serverError } from "@/lib/api-utils";
import { buildOtaVehicleWhere } from "@/lib/ota/entity-filters";

export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, "ota-vehicles", "view");
  if ("error" in auth) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const { offset, limit } = parsePagination(searchParams, 50, 500);
    const where = buildOtaVehicleWhere(searchParams);

    // "Used in your trips" cross-references the already-synced Sales trips —
    // OTA's vehicle data has no direct company field (vehicles belong to an
    // association, not a company), so this is the closest signal available
    // for "has this vehicle actually driven for us."
    if (searchParams.get("usedInTrips") === "true") {
      const tripVehicleIds = await prisma.salesTrip.findMany({
        where: { vehicleExternalId: { not: null } },
        distinct: ["vehicleExternalId"],
        select: { vehicleExternalId: true },
      });
      where.id = { in: tripVehicleIds.map((t) => t.vehicleExternalId as string) };
    }

    const [rows, total] = await Promise.all([
      prisma.otaVehicle.findMany({ where, orderBy: { plateNumber: "asc" }, skip: offset, take: limit }),
      prisma.otaVehicle.count({ where }),
    ]);

    // Mark which of this page's vehicles have appeared in the synced Sales
    // trips — scoped to just this page's ids, not all 19.8k vehicles.
    const seenInTrips = new Set(
      (await prisma.salesTrip.findMany({
        where: { vehicleExternalId: { in: rows.map((r) => r.id) } },
        distinct: ["vehicleExternalId"],
        select: { vehicleExternalId: true },
      })).map((t) => t.vehicleExternalId)
    );

    return ok({
      data: rows.map((r) => ({ ...serializeOtaVehicle(r), usedInTrips: seenInTrips.has(r.id) })),
      meta: { total, offset, limit, hasMore: offset + rows.length < total },
    });
  } catch (error) {
    return serverError(error);
  }
}
