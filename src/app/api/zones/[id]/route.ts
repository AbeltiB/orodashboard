// src/app/api/zones/[id]/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/api-auth";
import { badRequest, conflict, notFound, ok, serializeZone, serverError } from "@/lib/api-utils";
import { updateZoneSchema } from "@/lib/schemas/zone";

type Context = { params: Promise<{ id: string }> };

const zoneInclude = {
  supervisors: {
    include: { employee: { select: { id: true, firstName: true, lastName: true, code: true } } },
    orderBy: { assignedAt: "asc" },
  },
  _count: { select: { stations: { where: { isDeleted: false } } } },
} as const;

export async function GET(request: NextRequest, context: Context) {
  const auth = await requirePermission(request, "stations", "view");
  if ("error" in auth) return auth.error;

  try {
    const { id } = await context.params;
    const zone = await prisma.zone.findUnique({ where: { id }, include: zoneInclude });
    if (!zone) return notFound("Zone");
    return ok(serializeZone(zone));
  } catch (error) {
    return serverError(error);
  }
}

export async function PATCH(request: NextRequest, context: Context) {
  const auth = await requirePermission(request, "stations", "edit");
  if ("error" in auth) return auth.error;

  try {
    const { id } = await context.params;
    const body = await request.json();
    const parsed = updateZoneSchema.safeParse(body);
    if (!parsed.success) return badRequest("Invalid request body.", parsed.error.flatten());

    const existing = await prisma.zone.findUnique({ where: { id } });
    if (!existing) return notFound("Zone");

    if (parsed.data.region || parsed.data.name) {
      const region = parsed.data.region ?? existing.region;
      const name = parsed.data.name ?? existing.name;
      const conflictZone = await prisma.zone.findFirst({
        where: { region, name, id: { not: id } },
        select: { id: true },
      });
      if (conflictZone) return conflict("A zone with this name already exists in this region.");
    }

    const zone = await prisma.zone.update({
      where: { id },
      data: parsed.data,
      include: zoneInclude,
    });

    return ok(serializeZone(zone));
  } catch (error) {
    return serverError(error);
  }
}

export async function DELETE(request: NextRequest, context: Context) {
  const auth = await requirePermission(request, "stations", "edit");
  if ("error" in auth) return auth.error;

  try {
    const { id } = await context.params;
    const existing = await prisma.zone.findUnique({ where: { id } });
    if (!existing) return notFound("Zone");

    // Soft delete only — stations pointing at this zone are left as-is
    // (same precedent as soft-deleting a Station), just excluded from
    // future "assign a zone" dropdowns.
    await prisma.zone.update({
      where: { id },
      data: { isDeleted: true, deletedAt: new Date() },
    });

    return ok({ message: "Zone soft-deleted.", id });
  } catch (error) {
    return serverError(error);
  }
}
