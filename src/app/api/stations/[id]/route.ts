import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma, type Terminal } from "@/generated/prisma/client";
import { requirePermission } from "@/lib/api-auth";
import {
  badRequest,
  notFound,
  ok,
  roadTypeToEnum,
  roadTypeFromEnum,
  serializeStation,
  serverError,
} from "@/lib/api-utils";
import { updateStationSchema } from "@/lib/schemas/station";
import type { TerminalInput } from "@/lib/schemas/terminal";

type StationContext = {
  params: Promise<{ id: string }>;
};

const stationInclude = {
  terminalsAsOrigin: {
    where: { isDeleted: false },
    include: { linkedStation: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  },
  zone: { select: { id: true, name: true, region: true } },
  _count: {
    select: {
      terminalsAsOrigin: { where: { isDeleted: false } },
      employees: { where: { isDeleted: false } },
      posMachines: { where: { isDeleted: false } },
    },
  },
} as const;

export async function GET(request: NextRequest, context: StationContext) {
  const auth = await requirePermission(request, "stations", "view");
  if ("error" in auth) return auth.error;

  try {
    const { id } = await context.params;
    const station = await prisma.station.findUnique({
      where: { id },
      include: stationInclude,
    });

    if (!station) return notFound("Station");

    return ok(serializeStation(station));
  } catch (error) {
    return serverError(error);
  }
}

export async function PATCH(request: NextRequest, context: StationContext) {
  const auth = await requirePermission(request, "stations", "edit");
  if ("error" in auth) return auth.error;

  try {
    const { id } = await context.params;
    const body = await request.json();
    const parsed = updateStationSchema.safeParse(body);

    if (!parsed.success) {
      return badRequest("Invalid request body.", parsed.error.flatten());
    }

    const { name, region, zoneId, location, terminals } = parsed.data;

    const existing = await prisma.station.findUnique({
      where: { id },
      include: { terminalsAsOrigin: { where: { isDeleted: false } } },
    });

    if (!existing) return notFound("Station");

    const updated = await prisma.$transaction(async (tx) => {
      if (terminals) {
        const existingById = new Map(existing.terminalsAsOrigin.map((t) => [t.id, t]));
        const inputIds = new Set(terminals.filter((t) => t.id).map((t) => t.id!));

        // Soft-delete terminals that are no longer in the input
        for (const [existingId] of existingById) {
          if (!inputIds.has(existingId)) {
            await tx.terminal.update({
              where: { id: existingId },
              data: { isDeleted: true, deletedAt: new Date() },
            });
          }
        }

        // Update existing terminals and create new ones
        for (const input of terminals) {
          const data = terminalInputToPrisma(input, input.id ? existingById.get(input.id) : undefined);

          if (input.id && existingById.has(input.id)) {
            await tx.terminal.update({
              where: { id: input.id },
              data,
            });
          } else {
            await tx.terminal.create({
              data: { ...data, stationId: id },
            });
          }
        }
      }

      return tx.station.update({
        where: { id },
        data: {
          ...(name !== undefined && { name }),
          ...(region !== undefined && { region }),
          ...(zoneId !== undefined && { zoneId }),
          ...(location !== undefined && { location }),
        },
        include: stationInclude,
      });
    });

    return ok(serializeStation(updated));
  } catch (error) {
    return serverError(error);
  }
}

export async function DELETE(request: NextRequest, context: StationContext) {
  const auth = await requirePermission(request, "stations", "edit");
  if ("error" in auth) return auth.error;

  try {
    const { id } = await context.params;

    const existing = await prisma.station.findUnique({ where: { id } });
    if (!existing) return notFound("Station");

    await prisma.$transaction([
      prisma.terminal.updateMany({
        where: { stationId: id, isDeleted: false },
        data: { isDeleted: true, deletedAt: new Date() },
      }),
      prisma.station.update({
        where: { id },
        data: { isDeleted: true, deletedAt: new Date() },
      }),
    ]);

    return ok({ message: "Station soft-deleted.", id });
  } catch (error) {
    return serverError(error);
  }
}

function terminalInputToPrisma(
  input: TerminalInput,
  existing?: Terminal
): Prisma.TerminalUncheckedCreateWithoutStationInput {
  const isStation = input.isStation ?? existing?.isLinkedStation ?? false;
  const roadTypeInput =
    input.roadType ?? (existing ? roadTypeFromEnum(existing.roadType) : "asphalt");

  return {
    name: input.name ?? existing?.name ?? "",
    isLinkedStation: isStation,
    linkedStationId: isStation
      ? (input.linkedStationId ?? existing?.linkedStationId ?? null)
      : null,
    isDeparture: input.isDeparture ?? existing?.isDeparture ?? false,
    isArrival: input.isArrival ?? existing?.isArrival ?? true,
    distanceKm: input.distanceKm ?? existing?.distanceKm ?? 0,
    roadType: roadTypeToEnum(roadTypeInput),
    asphaltKm: roadTypeInput === "mixed" ? (input.asphaltKm ?? existing?.asphaltKm ?? 0) : null,
    gravelKm: roadTypeInput === "mixed" ? (input.gravelKm ?? existing?.gravelKm ?? 0) : null,
  };
}
