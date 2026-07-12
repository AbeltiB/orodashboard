// src/app/api/zones/[id]/supervisors/[employeeId]/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/api-auth";
import { notFound, ok, serverError } from "@/lib/api-utils";

type Context = { params: Promise<{ id: string; employeeId: string }> };

export async function DELETE(request: NextRequest, context: Context) {
  const auth = await requirePermission(request, "stations", "edit");
  if ("error" in auth) return auth.error;

  try {
    const { id, employeeId } = await context.params;

    const existing = await prisma.zoneSupervisor.findUnique({
      where: { zoneId_employeeId: { zoneId: id, employeeId } },
    });
    if (!existing) return notFound("Zone supervisor assignment");

    await prisma.zoneSupervisor.delete({
      where: { zoneId_employeeId: { zoneId: id, employeeId } },
    });

    return ok({ message: "Zone supervisor removed.", zoneId: id, employeeId });
  } catch (error) {
    return serverError(error);
  }
}
