// src/app/api/shifts/import/[batchId]/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/api-auth";
import { notFound, ok, serializeShiftImportBatch, serverError } from "@/lib/api-utils";

type Context = { params: Promise<{ batchId: string }> };

export async function GET(request: NextRequest, context: Context) {
  const auth = await requirePermission(request, "shifts", "view");
  if ("error" in auth) return auth.error;

  try {
    const { batchId } = await context.params;
    const batch = await prisma.shiftImportBatch.findUnique({ where: { id: batchId } });
    if (!batch) return notFound("Import batch");
    return ok(serializeShiftImportBatch(batch));
  } catch (error) {
    return serverError(error);
  }
}
