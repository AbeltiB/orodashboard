// src/app/api/zones/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma, $Enums } from "@/generated/prisma/client";
import { requirePermission } from "@/lib/api-auth";
import { badRequest, conflict, created, ok, serializeZone, serverError } from "@/lib/api-utils";
import { createZoneSchema } from "@/lib/schemas/zone";

const zoneInclude = {
  supervisors: {
    include: { employee: { select: { id: true, firstName: true, lastName: true, code: true } } },
    orderBy: { assignedAt: "asc" },
  },
  _count: { select: { stations: { where: { isDeleted: false } } } },
} as const;

export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, "stations", "view");
  if ("error" in auth) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const region = searchParams.get("region")?.trim();
    const includeDeleted = searchParams.get("includeDeleted") === "true";

    const where: Prisma.ZoneWhereInput = {};
    if (!includeDeleted) where.isDeleted = false;
    if (region) where.region = region as $Enums.Region;

    const zones = await prisma.zone.findMany({
      where,
      include: zoneInclude,
      orderBy: [{ region: "asc" }, { name: "asc" }],
    });

    return ok({ data: zones.map(serializeZone) });
  } catch (error) {
    return serverError(error);
  }
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, "stations", "edit");
  if ("error" in auth) return auth.error;

  try {
    const body = await request.json();
    const parsed = createZoneSchema.safeParse(body);
    if (!parsed.success) return badRequest("Invalid request body.", parsed.error.flatten());

    const existing = await prisma.zone.findUnique({
      where: { region_name: { region: parsed.data.region, name: parsed.data.name } },
      select: { id: true },
    });
    if (existing) return conflict("A zone with this name already exists in this region.");

    const zone = await prisma.zone.create({
      data: parsed.data,
      include: zoneInclude,
    });

    return created(serializeZone(zone));
  } catch (error) {
    return serverError(error);
  }
}
