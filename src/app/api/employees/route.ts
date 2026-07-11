// src/app/api/employees/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { requireAuth } from "@/lib/api-auth";
import {
  badRequest,
  conflict,
  created,
  generateEmployeeCode,
  ok,
  parseIncludeDeleted,
  parsePagination,
  serializeEmployee,
  serverError,
} from "@/lib/api-utils";
import { createEmployeeSchema } from "@/lib/schemas/employee";

const employeeInclude = {
  station: { select: { id: true, name: true, code: true } },
  posMachines: {
    where: { isDeleted: false },
    select: { id: true, code: true, serial: true },
  },
} as const;

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if ("error" in auth) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const includeDeleted = parseIncludeDeleted(searchParams);
    const { offset, limit } = parsePagination(searchParams);

    const search = searchParams.get("search")?.trim();
    const role = searchParams.get("role")?.trim();
    const stationId = searchParams.get("stationId")?.trim();
    const sex = searchParams.get("sex")?.trim();

    const where: Prisma.EmployeeWhereInput = {};

    if (!includeDeleted) where.isDeleted = false;

    if (role) where.role = role as Prisma.EmployeeWhereInput["role"];
    if (sex) where.sex = sex as Prisma.EmployeeWhereInput["sex"];
    if (stationId) {
      where.stationId = stationId === "NONE" ? null : stationId;
    }

    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: "insensitive" } },
        { lastName: { contains: search, mode: "insensitive" } },
        { middleName: { contains: search, mode: "insensitive" } },
        { phone: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { code: { contains: search, mode: "insensitive" } },
        { fan: { contains: search, mode: "insensitive" } },
      ];
    }

    const [employees, total] = await Promise.all([
      prisma.employee.findMany({
        where,
        include: employeeInclude,
        orderBy: { createdAt: "desc" },
        skip: offset,
        take: limit,
      }),
      prisma.employee.count({ where }),
    ]);

    return ok({
      data: employees.map(serializeEmployee),
      meta: { total, offset, limit, hasMore: offset + employees.length < total },
    });
  } catch (error) {
    return serverError(error);
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if ("error" in auth) return auth.error;

  try {
    const body = await request.json();
    const parsed = createEmployeeSchema.safeParse(body);
    if (!parsed.success) return badRequest("Invalid request body.", parsed.error.flatten());

    const { employmentDate, email, fan, ...rest } = parsed.data;

    // Uniqueness checks (phone and email are enforced at DB level too, but give a friendlier error)
    const phoneConflict = await prisma.employee.findUnique({
      where: { phone: rest.phone },
      select: { id: true },
    });
    if (phoneConflict) return conflict("A employee with this phone number already exists.");

    if (email) {
      const emailConflict = await prisma.employee.findUnique({
        where: { email },
        select: { id: true },
      });
      if (emailConflict) return conflict("A employee with this email already exists.");
    }

    if (fan) {
      const fanConflict = await prisma.employee.findUnique({
        where: { fan },
        select: { id: true },
      });
      if (fanConflict) return conflict("A employee with this FAN already exists.");
    }

    const code = await generateEmployeeCode();

    const employee = await prisma.employee.create({
      data: {
        code,
        ...rest,
        email: email || null,
        fan: fan || null,
        employmentDate: employmentDate ? new Date(employmentDate) : null,
      },
      include: employeeInclude,
    });

    return created(serializeEmployee(employee));
  } catch (error) {
    return serverError(error);
  }
}