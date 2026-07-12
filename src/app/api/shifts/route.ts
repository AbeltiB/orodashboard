// src/app/api/shifts/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { requirePermission } from "@/lib/api-auth";
import {
  badRequest,
  created,
  ok,
  parseIncludeDeleted,
  parsePagination,
  serializeShiftAssignment,
  serverError,
} from "@/lib/api-utils";
import { createShiftSchema } from "@/lib/schemas/shift";

const shiftInclude = {
  employee: { select: { id: true, code: true, firstName: true, lastName: true } },
  station: { select: { id: true, name: true, code: true } },
  posMachine: { select: { id: true, code: true, serial: true } },
} as const;

export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, "shifts", "view");
  if ("error" in auth) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const includeDeleted = parseIncludeDeleted(searchParams);
    const { offset, limit } = parsePagination(searchParams);

    const stationId = searchParams.get("stationId")?.trim();
    const employeeId = searchParams.get("employeeId")?.trim();
    const dateFrom = searchParams.get("dateFrom")?.trim();
    const dateTo = searchParams.get("dateTo")?.trim();
    const shiftType = searchParams.get("shiftType")?.trim();

    const where: Prisma.ShiftAssignmentWhereInput = {};
    if (!includeDeleted) where.isDeleted = false;
    if (stationId) where.stationId = stationId;
    if (employeeId) where.employeeId = employeeId;
    if (shiftType) where.shiftType = shiftType as Prisma.ShiftAssignmentWhereInput["shiftType"];
    if (dateFrom || dateTo) {
      where.date = {
        ...(dateFrom && { gte: new Date(dateFrom) }),
        ...(dateTo && { lte: new Date(dateTo) }),
      };
    }

    const [shifts, total] = await Promise.all([
      prisma.shiftAssignment.findMany({
        where,
        include: shiftInclude,
        orderBy: [{ date: "desc" }, { shiftType: "asc" }],
        skip: offset,
        take: limit,
      }),
      prisma.shiftAssignment.count({ where }),
    ]);

    return ok({
      data: shifts.map(serializeShiftAssignment),
      meta: { total, offset, limit, hasMore: offset + shifts.length < total },
    });
  } catch (error) {
    return serverError(error);
  }
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, "shifts", "edit");
  if ("error" in auth) return auth.error;

  try {
    const body = await request.json();
    const parsed = createShiftSchema.safeParse(body);
    if (!parsed.success) return badRequest("Invalid request body.", parsed.error.flatten());

    const [employee, station] = await Promise.all([
      prisma.employee.findUnique({ where: { id: parsed.data.employeeId }, select: { id: true, isDeleted: true } }),
      prisma.station.findUnique({ where: { id: parsed.data.stationId }, select: { id: true, isDeleted: true } }),
    ]);
    if (!employee || employee.isDeleted) return badRequest("Employee not found or deleted.");
    if (!station || station.isDeleted) return badRequest("Station not found or deleted.");

    const existing = await prisma.shiftAssignment.findUnique({
      where: {
        employeeId_date_shiftType: {
          employeeId: parsed.data.employeeId,
          date: new Date(parsed.data.date),
          shiftType: parsed.data.shiftType,
        },
      },
    });
    if (existing && !existing.isDeleted) {
      return badRequest("This employee already has a shift assignment for that date and shift.");
    }

    const shift = existing
      ? await prisma.shiftAssignment.update({
          where: { id: existing.id },
          data: {
            stationId: parsed.data.stationId,
            role: parsed.data.role,
            posMachineId: parsed.data.posMachineId,
            source: "manual",
            isDeleted: false,
            deletedAt: null,
          },
          include: shiftInclude,
        })
      : await prisma.shiftAssignment.create({
          data: {
            employeeId: parsed.data.employeeId,
            stationId: parsed.data.stationId,
            date: new Date(parsed.data.date),
            shiftType: parsed.data.shiftType,
            role: parsed.data.role,
            posMachineId: parsed.data.posMachineId,
            source: "manual",
          },
          include: shiftInclude,
        });

    return created(serializeShiftAssignment(shift));
  } catch (error) {
    return serverError(error);
  }
}
