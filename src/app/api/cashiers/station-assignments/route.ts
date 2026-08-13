// src/app/api/cashiers/station-assignments/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/api-auth";
import { badRequest, created, notFound, ok, serverError } from "@/lib/api-utils";
import { assignCashierStationSchema } from "@/lib/schemas/cashier";

/**
 * POST /api/cashiers/station-assignments
 * Puts an existing employee in charge of a station's sales reconciliation —
 * they'll see every route/terminal departing from it in their portal.
 * Re-activates a previously-deactivated assignment instead of erroring on
 * the unique constraint if one already exists.
 */
export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, "cashiers", "edit");
  if ("error" in auth) return auth.error;

  try {
    const body = await request.json();
    const parsed = assignCashierStationSchema.safeParse(body);
    if (!parsed.success) return badRequest("Invalid request body.", parsed.error.flatten());

    const { employeeId, stationId } = parsed.data;

    const [employee, station] = await Promise.all([
      prisma.employee.findUnique({ where: { id: employeeId }, select: { id: true, isDeleted: true } }),
      prisma.station.findUnique({ where: { id: stationId }, select: { id: true, isDeleted: true } }),
    ]);
    if (!employee || employee.isDeleted) return notFound("Employee");
    if (!station || station.isDeleted) return notFound("Station");

    const assignment = await prisma.cashierStationAssignment.upsert({
      where: { employeeId_stationId: { employeeId, stationId } },
      create: { employeeId, stationId, assignedBy: auth.session.adminUserId },
      update: { isActive: true, assignedBy: auth.session.adminUserId, assignedAt: new Date() },
      include: { station: { select: { id: true, name: true, code: true } } },
    });

    return created({
      id: assignment.id,
      employeeId: assignment.employeeId,
      station: assignment.station,
      isActive: assignment.isActive,
      assignedAt: assignment.assignedAt,
    });
  } catch (error) {
    return serverError(error);
  }
}

/**
 * GET /api/cashiers/station-assignments?employeeId=...
 */
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, "cashiers", "view");
  if ("error" in auth) return auth.error;

  try {
    const employeeId = new URL(request.url).searchParams.get("employeeId")?.trim();
    if (!employeeId) return badRequest("employeeId query param is required.");

    const assignments = await prisma.cashierStationAssignment.findMany({
      where: { employeeId },
      orderBy: { assignedAt: "desc" },
      include: { station: { select: { id: true, name: true, code: true } } },
    });

    return ok({ data: assignments });
  } catch (error) {
    return serverError(error);
  }
}
