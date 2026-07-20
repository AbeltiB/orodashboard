// src/lib/ota/entity-filters.ts
// Shared filter-parsing for the OTA employees/terminals/vehicles list
// endpoints — same rationale as sales-filters.ts: keep the list route and
// any future export route from drifting on what a filter means.
import { Prisma } from "@/generated/prisma/client";

export function buildOtaEmployeeWhere(searchParams: URLSearchParams): Prisma.OtaEmployeeWhereInput {
  const active = searchParams.get("active")?.trim();
  const role = searchParams.get("role")?.trim();
  const search = searchParams.get("search")?.trim();

  const where: Prisma.OtaEmployeeWhereInput = {};
  if (active === "true") where.isActive = true;
  if (active === "false") where.isActive = false;
  if (role) where.roleName = role;
  if (search) {
    where.OR = [
      { fullName: { contains: search, mode: "insensitive" } },
      { phone: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
      { position: { contains: search, mode: "insensitive" } },
      { department: { contains: search, mode: "insensitive" } },
    ];
  }
  return where;
}

export function buildOtaTerminalWhere(searchParams: URLSearchParams): Prisma.OtaTerminalWhereInput {
  const status = searchParams.get("status")?.trim();
  const search = searchParams.get("search")?.trim();

  const where: Prisma.OtaTerminalWhereInput = {};
  if (status) where.status = status;
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { address: { contains: search, mode: "insensitive" } },
      { cityName: { contains: search, mode: "insensitive" } },
    ];
  }
  return where;
}

export function buildOtaVehicleWhere(searchParams: URLSearchParams): Prisma.OtaVehicleWhereInput {
  const status = searchParams.get("status")?.trim();
  const fleetType = searchParams.get("fleetType")?.trim();
  const assignedTerminalId = searchParams.get("assignedTerminalId")?.trim();
  const search = searchParams.get("search")?.trim();

  const where: Prisma.OtaVehicleWhereInput = {};
  if (status) where.status = status;
  if (fleetType) where.fleetTypeName = fleetType;
  if (assignedTerminalId) where.assignedTerminalId = assignedTerminalId;
  if (search) {
    where.OR = [
      { plateNumber: { contains: search, mode: "insensitive" } },
      { driverName: { contains: search, mode: "insensitive" } },
      { driverLicenceNumber: { contains: search, mode: "insensitive" } },
    ];
  }
  return where;
}
