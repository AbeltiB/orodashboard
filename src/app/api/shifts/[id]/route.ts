// src/app/api/shifts/[id]/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/api-auth";
import { badRequest, notFound, ok, serializeShiftAssignment, serverError } from "@/lib/api-utils";
import { updateShiftSchema } from "@/lib/schemas/shift";

type Context = { params: Promise<{ id: string }> };

const shiftInclude = {
  employee: { select: { id: true, code: true, firstName: true, lastName: true } },
  station: { select: { id: true, name: true, code: true } },
  posMachine: { select: { id: true, code: true, serial: true } },
} as const;

export async function GET(request: NextRequest, context: Context) {
  const auth = await requirePermission(request, "shifts", "view");
  if ("error" in auth) return auth.error;

  try {
    const { id } = await context.params;
    const shift = await prisma.shiftAssignment.findUnique({ where: { id }, include: shiftInclude });
    if (!shift) return notFound("Shift assignment");
    return ok(serializeShiftAssignment(shift));
  } catch (error) {
    return serverError(error);
  }
}

export async function PATCH(request: NextRequest, context: Context) {
  const auth = await requirePermission(request, "shifts", "edit");
  if ("error" in auth) return auth.error;

  try {
    const { id } = await context.params;
    const body = await request.json();
    const parsed = updateShiftSchema.safeParse(body);
    if (!parsed.success) return badRequest("Invalid request body.", parsed.error.flatten());

    const existing = await prisma.shiftAssignment.findUnique({ where: { id } });
    if (!existing) return notFound("Shift assignment");

    if (parsed.data.stationId) {
      const station = await prisma.station.findUnique({ where: { id: parsed.data.stationId }, select: { isDeleted: true } });
      if (!station || station.isDeleted) return badRequest("Station not found or deleted.");
    }

    const { posMachineId, ...rest } = parsed.data;
    const shift = await prisma.shiftAssignment.update({
      where: { id },
      data: {
        ...rest,
        ...(posMachineId !== undefined && { posMachineId: posMachineId ?? null }),
      },
      include: shiftInclude,
    });

    return ok(serializeShiftAssignment(shift));
  } catch (error) {
    return serverError(error);
  }
}

export async function DELETE(request: NextRequest, context: Context) {
  const auth = await requirePermission(request, "shifts", "edit");
  if ("error" in auth) return auth.error;

  try {
    const { id } = await context.params;
    const existing = await prisma.shiftAssignment.findUnique({ where: { id }, select: { id: true } });
    if (!existing) return notFound("Shift assignment");

    await prisma.shiftAssignment.update({
      where: { id },
      data: { isDeleted: true, deletedAt: new Date() },
    });

    return ok({ message: "Shift assignment removed.", id });
  } catch (error) {
    return serverError(error);
  }
}
