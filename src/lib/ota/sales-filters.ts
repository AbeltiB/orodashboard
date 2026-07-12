// src/lib/ota/sales-filters.ts
// Shared filter-parsing for every /api/sales/* endpoint that reads trips —
// factored out so the trips list, the unpaginated export, and the
// by-ticketer rollup can never quietly drift apart on what a given filter
// means.
import { Prisma } from "@/generated/prisma/client";

export function buildSalesTripWhere(searchParams: URLSearchParams): Prisma.SalesTripWhereInput {
  const dateFrom = searchParams.get("dateFrom")?.trim();
  const dateTo = searchParams.get("dateTo")?.trim();
  const departureTerminal = searchParams.get("departureTerminal")?.trim();
  const arrivalTerminal = searchParams.get("arrivalTerminal")?.trim();
  const employeeExternalId = searchParams.get("employeeId")?.trim();
  const plateNo = searchParams.get("plateNo")?.trim();
  const search = searchParams.get("search")?.trim();

  const where: Prisma.SalesTripWhereInput = {};
  if (dateFrom || dateTo) {
    where.date = {
      ...(dateFrom && { gte: new Date(dateFrom) }),
      ...(dateTo && { lte: new Date(dateTo) }),
    };
  }
  if (departureTerminal) where.departureTerminalName = departureTerminal;
  if (arrivalTerminal) where.arrivalTerminalName = arrivalTerminal;
  if (employeeExternalId) where.employeeExternalId = employeeExternalId;
  if (plateNo) where.vehiclePlateNo = { contains: plateNo, mode: "insensitive" };
  if (search) {
    where.OR = [
      { employeeName: { contains: search, mode: "insensitive" } },
      { departureTerminalName: { contains: search, mode: "insensitive" } },
      { arrivalTerminalName: { contains: search, mode: "insensitive" } },
      { vehiclePlateNo: { contains: search, mode: "insensitive" } },
    ];
  }
  return where;
}
