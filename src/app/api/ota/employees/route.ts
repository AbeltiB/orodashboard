// src/app/api/ota/employees/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/api-auth";
import { ok, parsePagination, serializeOtaEmployee, serverError } from "@/lib/api-utils";
import { buildOtaEmployeeWhere } from "@/lib/ota/entity-filters";

export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, "ota-employees", "view");
  if ("error" in auth) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const { offset, limit } = parsePagination(searchParams, 50, 500);
    const where = buildOtaEmployeeWhere(searchParams);

    const [rows, total] = await Promise.all([
      prisma.otaEmployee.findMany({ where, orderBy: { fullName: "asc" }, skip: offset, take: limit }),
      prisma.otaEmployee.count({ where }),
    ]);

    return ok({
      data: rows.map(serializeOtaEmployee),
      meta: { total, offset, limit, hasMore: offset + rows.length < total },
    });
  } catch (error) {
    return serverError(error);
  }
}
