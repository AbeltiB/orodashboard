// src/app/api/fare-matrix/[id]/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-auth";
import { badRequest, notFound, ok, serverError } from "@/lib/api-utils";
import { upsertFareMatrixRowSchema } from "@/lib/schemas/fare-matrix";

type Context = { params: Promise<{ id: string }> };

/**
 * PATCH /api/fare-matrix/:id
 * Update a single fare matrix row by its DB id.
 */
export async function PATCH(request: NextRequest, context: Context) {
  const auth = requireAuth(request);
  if (auth) return auth;

  try {
    const { id } = await context.params;
    const body = await request.json();

    // Allow partial updates on a single row (only rates need to change usually)
    const parsed = upsertFareMatrixRowSchema.partial().safeParse(body);
    if (!parsed.success) return badRequest("Invalid request body.", parsed.error.flatten());

    const existing = await prisma.fareMatrix.findUnique({ where: { id } });
    if (!existing) return notFound("Fare matrix row");

    const updatedBy = request.headers.get("x-admin-id") ?? null;

    const row = await prisma.fareMatrix.update({
      where: { id },
      data: { ...parsed.data, updatedBy },
    });

    return ok({
      id: row.id,
      busType: row.busType,
      busLevel: row.busLevel,
      asphaltRate: Number(row.asphaltRate),
      gravelRate: Number(row.gravelRate),
      updatedBy: row.updatedBy,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  } catch (error) {
    return serverError(error);
  }
}