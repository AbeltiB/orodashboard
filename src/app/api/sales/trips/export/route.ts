// src/app/api/sales/trips/export/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/api-auth";
import { ok, serializeSalesTrip, serverError } from "@/lib/api-utils";
import { buildSalesTripWhere } from "@/lib/ota/sales-filters";

// Safety cap, not a real-world limit — comfortably above the ~18k rows on
// file today with headroom for growth, just bounding worst case if someone
// exports with literally no filters years from now.
const MAX_EXPORT_ROWS = 50_000;

/**
 * GET /api/sales/trips/export
 * Every trip matching the current filters, unpaginated (capped at
 * MAX_EXPORT_ROWS) — backs the Sales page's CSV/PDF export so "no filter"
 * really does mean "everything", not just the current page.
 */
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, "sales", "view");
  if ("error" in auth) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const where = buildSalesTripWhere(searchParams);

    const trips = await prisma.salesTrip.findMany({
      where,
      orderBy: [{ date: "desc" }, { id: "desc" }],
      take: MAX_EXPORT_ROWS,
    });

    return ok({ data: trips.map(serializeSalesTrip), truncated: trips.length === MAX_EXPORT_ROWS });
  } catch (error) {
    return serverError(error);
  }
}
