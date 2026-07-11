// src/app/api/employees/[id]/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-auth";
import {
  badRequest,
  conflict,
  notFound,
  ok,
  serializeEmployee,
  serverError,
} from "@/lib/api-utils";
import { updateEmployeeSchema } from "@/lib/schemas/employee";

type Context = { params: Promise<{ id: string }> };

const employeeInclude = {
  station: { select: { id: true, name: true, code: true } },
  posMachines: {
    where: { isDeleted: false },
    select: { id: true, code: true, serial: true },
  },
} as const;

export async function GET(request: NextRequest, context: Context) {
  const auth = await requireAuth(request);
  if ("error" in auth) return auth.error;

  try {
    const { id } = await context.params;
    const employee = await prisma.employee.findUnique({
      where: { id },
      include: {
        ...employeeInclude,
        pettyCash: { orderBy: { date: "desc" } },
        posMachineHistory: {
          orderBy: { fromDate: "desc" },
          take: 20,
          include: { posMachine: { select: { code: true, serial: true, make: true, model: true } } },
        },
      },
    });

    if (!employee) return notFound("Employee");

    return ok({
      ...serializeEmployee(employee),
      pettyCash: employee.pettyCash.map((p) => ({
        id: p.id,
        amount: Number(p.amount),
        date: p.date,
        method: p.method,
        reference: p.reference,
        note: p.note,
        createdAt: p.createdAt,
      })),
      posMachineHistory: employee.posMachineHistory.map((h) => ({
        id: h.id,
        posMachine: h.posMachine,
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
  const auth = await requireAuth(request);
  if ("error" in auth) return auth.error;

  try {
    const { id } = await context.params;
    const body = await request.json();
    const parsed = updateEmployeeSchema.safeParse(body);
    if (!parsed.success) return badRequest("Invalid request body.", parsed.error.flatten());

    const existing = await prisma.employee.findUnique({ where: { id }, select: { id: true } });
    if (!existing) return notFound("Employee");

    const { employmentDate, email, fan, ...rest } = parsed.data;

    // Check uniqueness only for fields being changed
    if (rest.phone) {
      const conflict_ = await prisma.employee.findFirst({
        where: { phone: rest.phone, id: { not: id } },
        select: { id: true },
      });
      if (conflict_) return conflict("Phone number is already used by another employee.");
    }
    if (email) {
      const conflict_ = await prisma.employee.findFirst({
        where: { email, id: { not: id } },
        select: { id: true },
      });
      if (conflict_) return conflict("Email is already used by another employee.");
    }
    if (fan) {
      const conflict_ = await prisma.employee.findFirst({
        where: { fan, id: { not: id } },
        select: { id: true },
      });
      if (conflict_) return conflict("FAN is already used by another employee.");
    }

    const employee = await prisma.employee.update({
      where: { id },
      data: {
        ...rest,
        ...(email !== undefined && { email: email || null }),
        ...(fan !== undefined && { fan: fan || null }),
        ...(employmentDate !== undefined && {
          employmentDate: employmentDate ? new Date(employmentDate) : null,
        }),
      },
      include: employeeInclude,
    });

    return ok(serializeEmployee(employee));
  } catch (error) {
    return serverError(error);
  }
}

export async function DELETE(request: NextRequest, context: Context) {
  const auth = await requireAuth(request);
  if ("error" in auth) return auth.error;

  try {
    const { id } = await context.params;
    const existing = await prisma.employee.findUnique({ where: { id }, select: { id: true } });
    if (!existing) return notFound("Employee");

    // Unassign from POS machines before soft-deleting
    await prisma.$transaction([
      prisma.posMachine.updateMany({
        where: { employeeId: id },
        data: { employeeId: null },
      }),
      prisma.employee.update({
        where: { id },
        data: { isDeleted: true, deletedAt: new Date() },
      }),
    ]);

    return ok({ message: "Employee soft-deleted.", id });
  } catch (error) {
    return serverError(error);
  }
}