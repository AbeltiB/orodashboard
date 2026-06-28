import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma, type Terminal } from "@/generated/prisma/client";
import { requireAuth } from "@/lib/api-auth";
import {
  badRequest,
  notFound,
  ok,
  roadTypeToEnum,
  roadTypeFromEnum,
  serializeTerminal,
  serverError,
} from "@/lib/api-utils";
import { updateTerminalSchema } from "@/lib/schemas/terminal";

type TerminalContext = {
  params: Promise<{ id: string }>;
};

const terminalInclude = {
  station: { select: { id: true, name: true, code: true } },
  linkedStation: { select: { id: true, name: true, code: true } },
} as const;

export async function GET(request: NextRequest, context: TerminalContext) {
  const auth = requireAuth(request);
  if (auth) return auth;

  try {
    const { id } = await context.params;
    const terminal = await prisma.terminal.findUnique({
      where: { id },
      include: terminalInclude,
    });

    if (!terminal) return notFound("Terminal");

    return ok({
      ...serializeTerminal(terminal),
      station: terminal.station,
      linkedStation: terminal.linkedStation,
    });
  } catch (error) {
    return serverError(error);
  }
}

export async function PATCH(request: NextRequest, context: TerminalContext) {
  const auth = requireAuth(request);
  if (auth) return auth;

  try {
    const { id } = await context.params;
    const body = await request.json();
    const parsed = updateTerminalSchema.safeParse(body);

    if (!parsed.success) {
      return badRequest("Invalid request body.", parsed.error.flatten());
    }

    const existing = await prisma.terminal.findUnique({ where: { id } });
    if (!existing) return notFound("Terminal");

    const input = parsed.data;
    const isStation = input.isStation ?? existing.isLinkedStation;
    const roadTypeInput = input.roadType ?? roadTypeFromEnum(existing.roadType);

    const terminal = await prisma.terminal.update({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.isStation !== undefined && { isLinkedStation: input.isStation }),
        linkedStationId: isStation
          ? (input.linkedStationId ?? existing.linkedStationId ?? null)
          : null,
        ...(input.isDeparture !== undefined && { isDeparture: input.isDeparture }),
        ...(input.isArrival !== undefined && { isArrival: input.isArrival }),
        ...(input.distanceKm !== undefined && { distanceKm: input.distanceKm }),
        ...(input.roadType !== undefined && { roadType: roadTypeToEnum(input.roadType) }),
        asphaltKm: roadTypeInput === "mixed" ? (input.asphaltKm ?? existing.asphaltKm ?? 0) : null,
        gravelKm: roadTypeInput === "mixed" ? (input.gravelKm ?? existing.gravelKm ?? 0) : null,
      },
      include: terminalInclude,
    });

    return ok({
      ...serializeTerminal(terminal),
      station: terminal.station,
      linkedStation: terminal.linkedStation,
    });
  } catch (error) {
    return serverError(error);
  }
}

export async function DELETE(request: NextRequest, context: TerminalContext) {
  const auth = requireAuth(request);
  if (auth) return auth;

  try {
    const { id } = await context.params;

    const existing = await prisma.terminal.findUnique({ where: { id } });
    if (!existing) return notFound("Terminal");

    await prisma.terminal.update({
      where: { id },
      data: { isDeleted: true, deletedAt: new Date() },
    });

    return ok({ message: "Terminal soft-deleted.", id });
  } catch (error) {
    return serverError(error);
  }
}
