// src/app/api/pos-machines/[id]/sessions/[sessionId]/end/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/api-auth";
import { badRequest, notFound, ok, serializePosSession, serverError } from "@/lib/api-utils";
import { endPosSessionSchema } from "@/lib/schemas/pos-session";

type Context = { params: Promise<{ id: string; sessionId: string }> };

export async function POST(request: NextRequest, context: Context) {
  const auth = await requirePermission(request, "pos-machines", "edit");
  if ("error" in auth) return auth.error;

  try {
    const { id, sessionId } = await context.params;
    const body = await request.json().catch(() => ({}));
    const parsed = endPosSessionSchema.safeParse(body);
    if (!parsed.success) return badRequest("Invalid request body.", parsed.error.flatten());

    const session = await prisma.posSession.findFirst({ where: { id: sessionId, posMachineId: id } });
    if (!session) return notFound("POS session");
    if (session.endedAt) return badRequest("This session has already ended.");

    const updated = await prisma.posSession.update({
      where: { id: sessionId },
      data: {
        endedAt: new Date(),
        ...(parsed.data.note !== undefined && { note: parsed.data.note }),
      },
      include: { employee: { select: { id: true, code: true } } },
    });

    return ok(serializePosSession(updated));
  } catch (error) {
    return serverError(error);
  }
}
