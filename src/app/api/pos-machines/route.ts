// src/app/api/pos-machines/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { requirePermission } from "@/lib/api-auth";
import {
  badRequest,
  conflict,
  created,
  generatePosCode,
  ok,
  parseIncludeDeleted,
  parsePagination,
  serializePosMachine,
  serverError,
} from "@/lib/api-utils";
import { createPosMachineSchema } from "@/lib/schemas/pos-machine";

const posInclude = {
  station: { select: { id: true, name: true, code: true } },
  employee: { select: { id: true, code: true, firstName: true, lastName: true } },
} as const;

export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, "pos-machines", "view");
  if ("error" in auth) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const includeDeleted = parseIncludeDeleted(searchParams);
    const { offset, limit } = parsePagination(searchParams);

    const search = searchParams.get("search")?.trim();
    const status = searchParams.get("status")?.trim();
    const stationId = searchParams.get("stationId")?.trim();
    const employeeId = searchParams.get("employeeId")?.trim();

    const where: Prisma.PosMachineWhereInput = {};
    if (!includeDeleted) where.isDeleted = false;
    if (status) where.status = status as Prisma.PosMachineWhereInput["status"];
    if (stationId) where.stationId = stationId === "NONE" ? null : stationId;
    if (employeeId) where.employeeId = employeeId === "NONE" ? null : employeeId;

    if (search) {
      where.OR = [
        { serial: { contains: search, mode: "insensitive" } },
        { code: { contains: search, mode: "insensitive" } },
        { make: { contains: search, mode: "insensitive" } },
        { model: { contains: search, mode: "insensitive" } },
        { appVersion: { contains: search, mode: "insensitive" } },
      ];
    }

    const [machines, total] = await Promise.all([
      prisma.posMachine.findMany({
        where,
        include: posInclude,
        orderBy: { createdAt: "desc" },
        skip: offset,
        take: limit,
      }),
      prisma.posMachine.count({ where }),
    ]);

    return ok({
      data: machines.map(serializePosMachine),
      meta: { total, offset, limit, hasMore: offset + machines.length < total },
    });
  } catch (error) {
    return serverError(error);
  }
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, "pos-machines", "edit");
  if ("error" in auth) return auth.error;

  try {
    const body = await request.json();
    const parsed = createPosMachineSchema.safeParse(body);
    if (!parsed.success) return badRequest("Invalid request body.", parsed.error.flatten());

    const serialConflict = await prisma.posMachine.findUnique({
      where: { serial: parsed.data.serial },
      select: { id: true },
    });
    if (serialConflict) return conflict("A POS machine with this serial number already exists.");

    if (parsed.data.assignmentMode === "SHARED" && parsed.data.employeeId) {
      return badRequest("SHARED machines can't be assigned an employeeId directly — use /sessions once created.");
    }

    const code = await generatePosCode();
    const { employeeId, stationId, ...rest } = parsed.data;

    const machine = await prisma.posMachine.create({
      data: {
        code,
        ...rest,
        ...(stationId && { stationId }),
        ...(employeeId && { employeeId }),
      },
      include: posInclude,
    });

    // Write initial history entry if assigned on creation
    if (employeeId || stationId) {
      const employee = employeeId
        ? await prisma.employee.findUnique({
            where: { id: employeeId },
            select: { firstName: true, lastName: true },
          })
        : null;

      const station = stationId
        ? await prisma.station.findUnique({
            where: { id: stationId },
            select: { name: true },
          })
        : null;

      await prisma.posMachineHistory.create({
        data: {
          posMachineId: machine.id,
          employeeId: employeeId ?? null,
          employeeName: employee
            ? `${employee.firstName} ${employee.lastName}`
            : null,
          stationId: stationId ?? null,
          stationName: station?.name ?? null,
          fromDate: new Date(),
        },
      });
    }

    return created(serializePosMachine(machine));
  } catch (error) {
    return serverError(error);
  }
}