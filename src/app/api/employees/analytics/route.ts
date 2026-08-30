// src/app/api/employees/analytics/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/api-auth";
import { ok, serverError } from "@/lib/api-utils";

function normalizePhone(p: string): string {
  return p.replace(/\D/g, "").slice(-9);
}

/**
 * GET /api/employees/analytics
 * Roster-wide headcount/tenure/data-quality stats, plus the station-by-
 * station employee list that backs the network diagram at the bottom of
 * the Employees page. Matching to OTA's own registry (for the data-quality
 * gap panel) is phone-normalized (last 9 digits) — there's no shared id
 * between our Employee table and OtaEmployee, only sales_trips.employeeExternalId
 * <-> OtaEmployee.userId is a hard join (confirmed live).
 */
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, "employees", "view");
  if ("error" in auth) return auth.error;

  try {
    const [employees, otaEmployees, stations, otaTerminals] = await Promise.all([
      prisma.employee.findMany({
        where: { isDeleted: false },
        select: {
          id: true, firstName: true, middleName: true, lastName: true, phone: true,
          role: true, stationId: true, employmentDate: true,
          station: { select: { id: true, name: true, code: true } },
          posMachines: { where: { isDeleted: false }, select: { id: true } },
        },
      }),
      prisma.otaEmployee.findMany({
        select: { id: true, userId: true, fullName: true, phone: true, terminalName: true, isActive: true },
      }),
      prisma.station.findMany({ where: { isDeleted: false }, select: { id: true, name: true, code: true } }),
      // "Our" 16 OTA-assigned terminals, for the diagram's non-operational nodes.
      prisma.otaCompanyRoute.findMany({ select: { departureTerminalId: true, departureTerminalName: true }, distinct: ["departureTerminalId"] }),
    ]);

    const otaByPhone = new Map(otaEmployees.filter((o) => o.phone).map((o) => [normalizePhone(o.phone!), o]));
    const employeePhonesMatched = new Set<string>();

    // ── Headcount ──
    const byRole: Record<string, number> = {};
    const byStation = new Map<string, { stationId: string; stationName: string; count: number }>();
    let unassigned = 0;
    const now = Date.now();
    let tenureUnder1 = 0, tenure1to3 = 0, tenureOver3 = 0, tenureUnknown = 0;
    let noPos = 0, hasPos = 0;
    const notInOta: { id: string; fullName: string; role: string }[] = [];

    for (const e of employees) {
      byRole[e.role] = (byRole[e.role] ?? 0) + 1;

      if (e.station) {
        const entry = byStation.get(e.station.id) ?? { stationId: e.station.id, stationName: e.station.name, count: 0 };
        entry.count++;
        byStation.set(e.station.id, entry);
      } else {
        unassigned++;
      }

      if (e.employmentDate) {
        const years = (now - e.employmentDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
        if (years < 1) tenureUnder1++;
        else if (years <= 3) tenure1to3++;
        else tenureOver3++;
      } else {
        tenureUnknown++;
      }

      if (e.role !== "SUPERVISOR") {
        if (e.posMachines.length > 0) hasPos++;
        else noPos++;
      }

      const normalized = normalizePhone(e.phone);
      const match = otaByPhone.get(normalized);
      if (match) {
        employeePhonesMatched.add(normalized);
      } else {
        const fullName = [e.firstName, e.middleName, e.lastName].filter(Boolean).join(" ");
        notInOta.push({ id: e.id, fullName, role: e.role });
      }
    }

    const otaOnlyNotInternal = otaEmployees
      .filter((o) => o.phone && !employeePhonesMatched.has(normalizePhone(o.phone)))
      .map((o) => ({ userId: o.userId, fullName: o.fullName, terminalName: o.terminalName, isActive: o.isActive }));

    // ── Station network (for the diagram) — our operational Stations, plus
    // the OTA-assigned terminals that have no matching Station yet, shown
    // with an empty roster so the full 16 are always represented. ──
    const employeesByStation = new Map<string, { id: string; fullName: string; role: string }[]>();
    for (const e of employees) {
      if (!e.station) continue;
      const fullName = [e.firstName, e.middleName, e.lastName].filter(Boolean).join(" ");
      const list = employeesByStation.get(e.station.id) ?? [];
      list.push({ id: e.id, fullName, role: e.role });
      employeesByStation.set(e.station.id, list);
    }

    function normalizeName(s: string): string {
      return s.toLowerCase().replace(/\s+/g, "");
    }
    const stationByNormalizedName = new Map(stations.map((s) => [normalizeName(s.name), s]));
    const coveredStationIds = new Set<string>();
    const stationNetwork: { id: string; name: string; isOperational: boolean; employees: { id: string; fullName: string; role: string }[] }[] = [];

    for (const t of otaTerminals) {
      const station = stationByNormalizedName.get(normalizeName(t.departureTerminalName));
      if (station) coveredStationIds.add(station.id);
      stationNetwork.push({
        id: station?.id ?? t.departureTerminalId,
        name: t.departureTerminalName,
        isOperational: !!station,
        employees: station ? (employeesByStation.get(station.id) ?? []) : [],
      });
    }
    // Any other Station with staff that isn't one of the 16 (e.g. an office/HQ station) still shows up.
    for (const s of stations) {
      if (coveredStationIds.has(s.id)) continue;
      const staff = employeesByStation.get(s.id);
      if (staff && staff.length > 0) stationNetwork.push({ id: s.id, name: s.name, isOperational: true, employees: staff });
    }

    return ok({
      headcount: {
        total: employees.length,
        byRole,
        byStation: [...byStation.values()].sort((a, b) => b.count - a.count),
        unassigned,
      },
      tenure: { under1y: tenureUnder1, from1to3y: tenure1to3, over3y: tenureOver3, unknown: tenureUnknown },
      posCoverage: { assigned: hasPos, unassigned: noPos },
      dataQuality: {
        notInOta: notInOta.sort((a, b) => a.fullName.localeCompare(b.fullName)),
        otaOnlyNotInternal: otaOnlyNotInternal.sort((a, b) => a.fullName.localeCompare(b.fullName)),
      },
      stationNetwork: stationNetwork.sort((a, b) => a.name.localeCompare(b.name)),
    });
  } catch (error) {
    return serverError(error);
  }
}
