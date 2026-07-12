// src/app/api/pos-machines/[id]/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/api-auth";
import {
  badRequest,
  conflict,
  notFound,
  ok,
  serializePosMachine,
  serverError,
} from "@/lib/api-utils";
import { updatePosMachineSchema } from "@/lib/schemas/pos-machine";

type Context = { params: Promise<{ id: string }> };

const posInclude = {
  station: { select: { id: true, name: true, code: true } },
  employee: { select: { id: true, code: true, firstName: true, lastName: true } },
} as const;

export async function GET(request: NextRequest, context: Context) {
  const auth = await requirePermission(request, "pos-machines", "view");
  if ("error" in auth) return auth.error;

  try {
    const { id } = await context.params;
    const machine = await prisma.posMachine.findUnique({
      where: { id },
      include: {
        ...posInclude,
        history: {
          orderBy: { fromDate: "desc" },
          take: 50,
          include: {
            employee: { select: { id: true, code: true, firstName: true, lastName: true } },
            station: { select: { id: true, code: true, name: true } },
          },
        },
      },
    });

    if (!machine) return notFound("POS machine");

    return ok({
      ...serializePosMachine(machine),
      history: machine.history.map((h) => ({
        id: h.id,
        employee: h.employee
          ? { id: h.employee.id, code: h.employee.code, name: `${h.employee.firstName} ${h.employee.lastName}` }
          : null,
        employeeName: h.employeeName,
        station: h.station ?? null,
        stationName: h.stationName,
        fromDate: h.fromDate,
        toDate: h.toDate,
        remark: h.remark,
        createdAt: h.createdAt,
      })),
    });
  } catch (error) {
    return serverError(error);
  }
}

export async function PATCH(request: NextRequest, context: Context) {
  const auth = await requirePermission(request, "pos-machines", "edit");
  if ("error" in auth) return auth.error;

  try {
    const { id } = await context.params;
    const body = await request.json();
    const parsed = updatePosMachineSchema.safeParse(body);
    if (!parsed.success) return badRequest("Invalid request body.", parsed.error.flatten());

    const existing = await prisma.posMachine.findUnique({ where: { id } });
    if (!existing) return notFound("POS machine");

    if (parsed.data.serial && parsed.data.serial !== existing.serial) {
      const serialConflict = await prisma.posMachine.findFirst({
        where: { serial: parsed.data.serial, id: { not: id } },
        select: { id: true },
      });
      if (serialConflict) return conflict("Serial number is already used by another machine.");
    }

    const { stationId, ...rest } = parsed.data;

    // EXCLUSIVE machines route station relocation through /assign too, so it
    // stays reflected in PosMachineHistory. SHARED machines have no per-person
    // custody concept, so their station is just a location field.
    if (stationId !== undefined && existing.assignmentMode === "EXCLUSIVE") {
      return badRequest("Use /assign to relocate an exclusively-assigned POS machine.");
    }

    const machine = await prisma.posMachine.update({
      where: { id },
      data: {
        ...rest,
        ...(stationId !== undefined && { stationId: stationId ?? null }),
      },
      include: posInclude,
    });

    return ok(serializePosMachine(machine));
  } catch (error) {
    return serverError(error);
  }
}

export async function DELETE(request: NextRequest, context: Context) {
  const auth = await requirePermission(request, "pos-machines", "edit");
  if ("error" in auth) return auth.error;

  try {
    const { id } = await context.params;
    const existing = await prisma.posMachine.findUnique({ where: { id }, select: { id: true } });
    if (!existing) return notFound("POS machine");

    await prisma.posMachine.update({
      where: { id },
      data: { isDeleted: true, deletedAt: new Date(), employeeId: null },
    });

    return ok({ message: "POS machine soft-deleted.", id });
  } catch (error) {
    return serverError(error);
  }
}
