// src/app/api/ota/employees/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/api-auth";
import { badRequest, created, ok, parsePagination, serializeOtaEmployee, serverError } from "@/lib/api-utils";
import { buildOtaEmployeeWhere } from "@/lib/ota/entity-filters";
import { createOtaEmployee } from "@/lib/ota/entity-sync";
import { OtaCreateError } from "@/lib/ota/client";
import { createOtaEmployeeSchema } from "@/lib/schemas/ota";

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

/**
 * POST /api/ota/employees
 * Creates a REAL account in OTA's production ticketing system (a genuine
 * write, not a mirror) via the endpoint discovered live at
 * POST /api/company-users, then upserts the result into our local mirror.
 */
export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, "ota-employees", "edit");
  if ("error" in auth) return auth.error;

  try {
    const body = await request.json();
    const parsed = createOtaEmployeeSchema.safeParse(body);
    if (!parsed.success) return badRequest("Invalid request body.", parsed.error.flatten());

    const employee = await createOtaEmployee(parsed.data);
    return created(serializeOtaEmployee(employee));
  } catch (error) {
    if (error instanceof OtaCreateError) return badRequest(error.message);
    return serverError(error);
  }
}
