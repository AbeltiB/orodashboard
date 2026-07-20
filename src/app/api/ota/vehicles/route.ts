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

    const [rows, total] = await Promise.all([
      prisma.otaVehicle.findMany({ where, orderBy: { plateNumber: "asc" }, skip: offset, take: limit }),
      prisma.otaVehicle.count({ where }),
    ]);

    return ok({
      data: rows.map(serializeOtaVehicle),
      meta: { total, offset, limit, hasMore: offset + rows.length < total },
    });
  } catch (error) {
    return serverError(error);
  }
}
