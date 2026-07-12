// src/app/api/pos-machines/[id]/sessions/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/api-auth";
import { badRequest, created, notFound, ok, serializePosSession, serverError } from "@/lib/api-utils";
import { startPosSessionSchema } from "@/lib/schemas/pos-session";

type Context = { params: Promise<{ id: string }> };

const sessionInclude = { employee: { select: { id: true, code: true } } } as const;

export async function GET(request: NextRequest, context: Context) {
  const auth = await requirePermission(request, "pos-machines", "view");
  if ("error" in auth) return auth.error;

  try {
    const { id } = await context.params;
    const machine = await prisma.posMachine.findUnique({ where: { id }, select: { id: true } });
    if (!machine) return notFound("POS machine");

    const sessions = await prisma.posSession.findMany({
      where: { posMachineId: id },
      include: sessionInclude,
      orderBy: { startedAt: "desc" },
      take: 100,
    });

    return ok({ data: sessions.map(serializePosSession) });
  } catch (error) {
    return serverError(error);
  }
}

export async function POST(request: NextRequest, context: Context) {
  const auth = await requirePermission(request, "pos-machines", "edit");
  if ("error" in auth) return auth.error;

  try {
    const { id } = await context.params;
    const body = await request.json();
    const parsed = startPosSessionSchema.safeParse(body);
    if (!parsed.success) return badRequest("Invalid request body.", parsed.error.flatten());

    const machine = await prisma.posMachine.findUnique({ where: { id } });
    if (!machine) return notFound("POS machine");
    if (machine.isDeleted) return badRequest("Cannot start a session on a decommissioned machine.");
    if (machine.assignmentMode !== "SHARED") {
      return badRequest("This machine is EXCLUSIVE-mode — use /assign instead of a session.");
    }

    const employee = await prisma.employee.findUnique({
      where: { id: parsed.data.employeeId },
      select: { id: true, firstName: true, lastName: true, isDeleted: true },
    });
    if (!employee) return notFound("Employee");
    if (employee.isDeleted) return badRequest("Cannot start a session for a deleted employee.");

    const station = machine.stationId
      ? await prisma.station.findUnique({ where: { id: machine.stationId }, select: { name: true } })
      : null;

    // Auto-close any currently-open session on this machine, then open the new
    // one, atomically — mirrors the same "at most one open row" invariant
    // PosMachineHistory already relies on for EXCLUSIVE machines.
    const [, session] = await prisma.$transaction([
      prisma.posSession.updateMany({
        where: { posMachineId: id, endedAt: null },
        data: { endedAt: new Date() },
      }),
      prisma.posSession.create({
        data: {
          posMachineId: id,
          employeeId: employee.id,
          employeeName: `${employee.firstName} ${employee.lastName}`,
          stationId: machine.stationId,
          stationName: station?.name ?? null,
          note: parsed.data.note,
          loggedBy: auth.session.adminUserId,
        },
        include: sessionInclude,
      }),
    ]);

    return created(serializePosSession(session));
  } catch (error) {
    return serverError(error);
  }
}
