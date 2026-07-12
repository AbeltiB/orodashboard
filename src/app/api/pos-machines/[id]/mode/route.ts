// src/app/api/pos-machines/[id]/mode/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/api-auth";
import { badRequest, notFound, ok, serializePosMachine, serverError } from "@/lib/api-utils";
import { switchPosModeSchema } from "@/lib/schemas/pos-session";

type Context = { params: Promise<{ id: string }> };

const posInclude = {
  station: { select: { id: true, name: true, code: true } },
  employee: { select: { id: true, code: true, firstName: true, lastName: true } },
} as const;

/**
 * POST /api/pos-machines/:id/mode
 * Switches a machine between EXCLUSIVE and SHARED assignment mode, cleaning
 * up whichever tracking mechanism the machine is leaving:
 *   EXCLUSIVE -> SHARED: clears employeeId, closes any open PosMachineHistory row.
 *   SHARED -> EXCLUSIVE: closes any open PosSession.
 */
export async function POST(request: NextRequest, context: Context) {
  const auth = await requirePermission(request, "pos-machines", "edit");
  if ("error" in auth) return auth.error;

  try {
    const { id } = await context.params;
    const body = await request.json();
    const parsed = switchPosModeSchema.safeParse(body);
    if (!parsed.success) return badRequest("Invalid request body.", parsed.error.flatten());

    const existing = await prisma.posMachine.findUnique({ where: { id } });
    if (!existing) return notFound("POS machine");

    const { assignmentMode } = parsed.data;
    if (existing.assignmentMode === assignmentMode) {
      return badRequest(`Machine is already in ${assignmentMode} mode.`);
    }

    if (assignmentMode === "SHARED") {
      await prisma.$transaction([
        prisma.posMachineHistory.updateMany({
          where: { posMachineId: id, toDate: null },
          data: { toDate: new Date() },
        }),
        prisma.posMachine.update({
          where: { id },
          data: { assignmentMode, employeeId: null },
        }),
      ]);
    } else {
      await prisma.$transaction([
        prisma.posSession.updateMany({
          where: { posMachineId: id, endedAt: null },
          data: { endedAt: new Date() },
        }),
        prisma.posMachine.update({
          where: { id },
          data: { assignmentMode },
        }),
      ]);
    }

    const machine = await prisma.posMachine.findUnique({ where: { id }, include: posInclude });
    return ok(serializePosMachine(machine!));
  } catch (error) {
    return serverError(error);
  }
}
