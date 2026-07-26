// src/lib/ota/sales-filters.ts
// Shared filter-parsing for every /api/sales/* endpoint that reads trips —
// factored out so the trips list, the unpaginated export, and the
// by-ticketer rollup can never quietly drift apart on what a given filter
// means.
import { Prisma } from "@/generated/prisma/client";
import { dateRangeFilter } from "@/lib/api-utils";

function numberParam(searchParams: URLSearchParams, key: string): number | undefined {
  const raw = searchParams.get(key)?.trim();
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

export function buildSalesTripWhere(searchParams: URLSearchParams): Prisma.SalesTripWhereInput {
  const dateFrom = searchParams.get("dateFrom")?.trim();
  const dateTo = searchParams.get("dateTo")?.trim();
  const departureTerminal = searchParams.get("departureTerminal")?.trim();
  const arrivalTerminal = searchParams.get("arrivalTerminal")?.trim();
  const employeeExternalId = searchParams.get("employeeId")?.trim();
  const plateNo = searchParams.get("plateNo")?.trim();
  const search = searchParams.get("search")?.trim();
  const companyName = searchParams.get("companyName")?.trim();
  const vehicleAssociation = searchParams.get("vehicleAssociation")?.trim();
  const vehicleFleetCategory = searchParams.get("vehicleFleetCategory")?.trim();
  const level = searchParams.get("level")?.trim();
  const minPassengers = numberParam(searchParams, "minPassengers");
  const maxPassengers = numberParam(searchParams, "maxPassengers");
  const minServiceCharge = numberParam(searchParams, "minServiceCharge");
  const maxServiceCharge = numberParam(searchParams, "maxServiceCharge");

  const where: Prisma.SalesTripWhereInput = {};
  const dateFilter = dateRangeFilter(dateFrom, dateTo);
  if (dateFilter) where.date = dateFilter;
  if (departureTerminal) where.departureTerminalName = departureTerminal;
  if (arrivalTerminal) where.arrivalTerminalName = arrivalTerminal;
  if (employeeExternalId) where.employeeExternalId = employeeExternalId;
  if (plateNo) where.vehiclePlateNo = { contains: plateNo, mode: "insensitive" };
  if (companyName) where.companyName = companyName;
  if (vehicleAssociation) where.vehicleAssociation = vehicleAssociation;
  if (vehicleFleetCategory) where.vehicleFleetCategory = vehicleFleetCategory;
  if (level) where.level = level;
  if (minPassengers !== undefined || maxPassengers !== undefined) {
    where.passengers = {
      ...(minPassengers !== undefined && { gte: minPassengers }),
      ...(maxPassengers !== undefined && { lte: maxPassengers }),
    };
  }
  if (minServiceCharge !== undefined || maxServiceCharge !== undefined) {
    where.totalServiceCharge = {
      ...(minServiceCharge !== undefined && { gte: minServiceCharge }),
      ...(maxServiceCharge !== undefined && { lte: maxServiceCharge }),
    };
  }
  if (search) {
    where.OR = [
      { employeeName: { contains: search, mode: "insensitive" } },
      { departureTerminalName: { contains: search, mode: "insensitive" } },
      { arrivalTerminalName: { contains: search, mode: "insensitive" } },
      { vehiclePlateNo: { contains: search, mode: "insensitive" } },
      { companyName: { contains: search, mode: "insensitive" } },
      { vehicleAssociation: { contains: search, mode: "insensitive" } },
    ];
  }
  return where;
}
