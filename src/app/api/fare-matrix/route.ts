// src/app/api/fare-matrix/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-auth";
import { badRequest, ok, serverError } from "@/lib/api-utils";
import { bulkUpsertFareMatrixSchema } from "@/lib/schemas/fare-matrix";

function serializeFareRow(row: {
  id: string;
  busType: string;
  busLevel: string;
  asphaltRate: unknown;
  gravelRate: unknown;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    busType: row.busType,
    busLevel: row.busLevel,
    asphaltRate: Number(row.asphaltRate),
    gravelRate: Number(row.gravelRate),
    updatedBy: row.updatedBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * GET /api/fare-matrix
 * Returns all rows (up to 9) sorted by busType then busLevel.
 * Response also includes a computed `calculatedFares` map for convenience:
 *   calculatedFares[busType][busLevel] = { asphalt: rate, gravel: rate }
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if ("error" in auth) return auth.error;

  try {
    const rows = await prisma.fareMatrix.findMany({
      orderBy: [{ busType: "asc" }, { busLevel: "asc" }],
    });

    // Build a nested lookup for the UI / fare calculator
    const matrix: Record<string, Record<string, { asphaltRate: number; gravelRate: number }>> = {};
    for (const row of rows) {
      if (!matrix[row.busType]) matrix[row.busType] = {};
      matrix[row.busType][row.busLevel] = {
        asphaltRate: Number(row.asphaltRate),
        gravelRate: Number(row.gravelRate),
      };
    }

    return ok({ data: rows.map(serializeFareRow), matrix });
  } catch (error) {
    return serverError(error);
  }
}

/**
 * PUT /api/fare-matrix
 * Bulk upsert — accepts an array of up to 9 rows.
 * Each row is matched on the unique (busType, busLevel) pair.
 * Sends the entire matrix in one transaction (matches the UI pattern).
 */
export async function PUT(request: NextRequest) {
  const auth = await requireAuth(request);
  if ("error" in auth) return auth.error;

  try {
    const body = await request.json();
    const parsed = bulkUpsertFareMatrixSchema.safeParse(body);
    if (!parsed.success) return badRequest("Invalid request body.", parsed.error.flatten());

    const updatedBy = request.headers.get("x-admin-id") ?? null;

    const rows = await prisma.$transaction(
      parsed.data.rows.map((row) =>
        prisma.fareMatrix.upsert({
          where: { busType_busLevel: { busType: row.busType, busLevel: row.busLevel } },
          create: {
            busType: row.busType,
            busLevel: row.busLevel,
            asphaltRate: row.asphaltRate,
            gravelRate: row.gravelRate,
            updatedBy,
          },
          update: {
            asphaltRate: row.asphaltRate,
            gravelRate: row.gravelRate,
            updatedBy,
          },
        })
      )
    );

    return ok({ data: rows.map(serializeFareRow) });
  } catch (error) {
    return serverError(error);
  }
}