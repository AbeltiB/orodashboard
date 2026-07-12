// src/app/api/zones/[id]/supervisors/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/api-auth";
import { badRequest, conflict, created, notFound, serverError } from "@/lib/api-utils";
import { addZoneSupervisorSchema } from "@/lib/schemas/zone";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: Context) {
  const auth = await requirePermission(request, "stations", "edit");
  if ("error" in auth) return auth.error;

  try {
    const { id } = await context.params;
    const body = await request.json();
    const parsed = addZoneSupervisorSchema.safeParse(body);
    if (!parsed.success) return badRequest("Invalid request body.", parsed.error.flatten());

    const zone = await prisma.zone.findUnique({ where: { id }, select: { id: true } });
    if (!zone) return notFound("Zone");

    const employee = await prisma.employee.findUnique({
      where: { id: parsed.data.employeeId },
      select: { id: true, role: true, isDeleted: true },
    });
    if (!employee) return notFound("Employee");
    if (employee.isDeleted) return badRequest("Cannot assign a deleted employee as a zone supervisor.");
    if (employee.role !== "SUPERVISOR") {
      return badRequest("Only employees with the Supervisor role can be assigned as a zone supervisor.");
    }

    const existing = await prisma.zoneSupervisor.findUnique({
      where: { zoneId_employeeId: { zoneId: id, employeeId: parsed.data.employeeId } },
    });
    if (existing) return conflict("This employee already supervises this zone.");

    const zoneSupervisor = await prisma.zoneSupervisor.create({
      data: { zoneId: id, employeeId: parsed.data.employeeId },
      include: { employee: { select: { id: true, firstName: true, lastName: true, code: true } } },
    });

    return created({
      employeeId: zoneSupervisor.employeeId,
      assignedAt: zoneSupervisor.assignedAt,
      name: `${zoneSupervisor.employee.firstName} ${zoneSupervisor.employee.lastName}`,
      employeeCode: zoneSupervisor.employee.code,
    });
  } catch (error) {
    return serverError(error);
  }
}
