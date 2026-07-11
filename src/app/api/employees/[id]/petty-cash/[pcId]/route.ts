// src/app/api/employees/[id]/petty-cash/[pcId]/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/api-auth";
import { badRequest, notFound, ok, serverError } from "@/lib/api-utils";
import { updatePettyCashSchema } from "@/lib/schemas/employee";

type Context = { params: Promise<{ id: string; pcId: string }> };

export async function PATCH(request: NextRequest, context: Context) {
  const auth = await requirePermission(request, "employees", "edit");
  if ("error" in auth) return auth.error;

  try {
    const { id, pcId } = await context.params;
    const body = await request.json();
    const parsed = updatePettyCashSchema.safeParse(body);
    if (!parsed.success) return badRequest("Invalid request body.", parsed.error.flatten());

    const existing = await prisma.pettyCash.findFirst({
      where: { id: pcId, employeeId: id },
    });
    if (!existing) return notFound("Petty cash record");

    const { date, ...rest } = parsed.data;
    const record = await prisma.pettyCash.update({
      where: { id: pcId },
      data: {
        ...rest,
        ...(date && { date: new Date(date) }),
      },
    });

    return ok({
      id: record.id,
      amount: Number(record.amount),
      date: record.date,
      method: record.method,
      reference: record.reference,
      note: record.note,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  } catch (error) {
    return serverError(error);
  }
}

export async function DELETE(request: NextRequest, context: Context) {
  const auth = await requirePermission(request, "employees", "edit");
  if ("error" in auth) return auth.error;

  try {
    const { id, pcId } = await context.params;
    const existing = await prisma.pettyCash.findFirst({
      where: { id: pcId, employeeId: id },
    });
    if (!existing) return notFound("Petty cash record");

    await prisma.pettyCash.delete({ where: { id: pcId } });
    return ok({ message: "Petty cash record deleted.", id: pcId });
  } catch (error) {
    return serverError(error);
  }
}