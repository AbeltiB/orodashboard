// src/app/api/pos-machines/[id]/assign/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-auth";
import { badRequest, notFound, ok, serializePosMachine, serverError } from "@/lib/api-utils";
import { assignPosMachineSchema } from "@/lib/schemas/pos-machine";

type Context = { params: Promise<{ id: string }> };

const posInclude = {
  station: { select: { id: true, name: true, code: true } },
  employee: { select: { id: true, code: true, firstName: true, lastName: true } },
} as const;

/**
 * POST /api/pos-machines/:id/assign
 * Reassigns a POS machine to a new employee/station combination.
 * - Closes the current open history record (sets toDate = today)
 * - Creates a new history record
 * - Updates the machine's current assignment fields
 */
export async function POST(request: NextRequest, context: Context) {
  const auth = await requireAuth(request);
  if ("error" in auth) return auth.error;

  try {
    const { id } = await context.params;
    const body = await request.json();
    const parsed = assignPosMachineSchema.safeParse(body);
    if (!parsed.success) return badRequest("Invalid request body.", parsed.error.flatten());

    const machine = await prisma.posMachine.findUnique({ where: { id } });
    if (!machine) return notFound("POS machine");
    if (machine.isDeleted) return badRequest("Cannot reassign a decommissioned machine.");

    const { employeeId, stationId, fromDate, remark } = parsed.data;

    // Resolve names for denormalised snapshot
    const [employee, station] = await Promise.all([
      employeeId
        ? prisma.employee.findUnique({
            where: { id: employeeId },
            select: { firstName: true, lastName: true },
          })
        : Promise.resolve(null),
      stationId
        ? prisma.station.findUnique({
            where: { id: stationId },
            select: { name: true },
          })
        : Promise.resolve(null),
    ]);

    const today = new Date(fromDate);

    await prisma.$transaction([
      // Close the current open history entry
      prisma.posMachineHistory.updateMany({
        where: { posMachineId: id, toDate: null },
        data: { toDate: today },
      }),
      // Create new history record
      prisma.posMachineHistory.create({
        data: {
          posMachineId: id,
          employeeId: employeeId ?? null,
          employeeName: employee ? `${employee.firstName} ${employee.lastName}` : null,
          stationId: stationId ?? null,
          stationName: station?.name ?? null,
          fromDate: today,
          remark: remark ?? null,
        },
      }),
      // Update the machine's current assignment
      prisma.posMachine.update({
        where: { id },
        data: {
          employeeId: employeeId ?? null,
          stationId: stationId ?? null,
        },
      }),
    ]);

    const updated = await prisma.posMachine.findUnique({ where: { id }, include: posInclude });
    return ok(serializePosMachine(updated!));
  } catch (error) {
    return serverError(error);
  }
}