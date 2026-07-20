// src/app/api/ota/terminals/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/api-auth";
import { ok, parsePagination, serializeOtaTerminal, serverError } from "@/lib/api-utils";
import { buildOtaTerminalWhere } from "@/lib/ota/entity-filters";

export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, "ota-terminals", "view");
  if ("error" in auth) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const { offset, limit } = parsePagination(searchParams, 50, 500);
    const where = buildOtaTerminalWhere(searchParams);

    const [rows, total] = await Promise.all([
      prisma.otaTerminal.findMany({ where, orderBy: { name: "asc" }, skip: offset, take: limit }),
      prisma.otaTerminal.count({ where }),
    ]);

    return ok({
      data: rows.map(serializeOtaTerminal),
      meta: { total, offset, limit, hasMore: offset + rows.length < total },
    });
  } catch (error) {
    return serverError(error);
  }
}
