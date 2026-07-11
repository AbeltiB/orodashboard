// src/app/api/reports/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/api-auth";
import { badRequest, ok, serverError } from "@/lib/api-utils";

/**
 * GET /api/reports
 *
 * Query params:
 *   type       — Required. One of: fare-summary | petty-cash-ledger | staff-roster | pos-fleet | station-summary
 *
 * Per-report filters (all optional):
 *
 * fare-summary:
 *   stationId, busType (BUS|MIDBUS|MINIBUS), busLevel (LEVEL_1|LEVEL_2|LEVEL_3)
 *
 * petty-cash-ledger:
 *   stationId, employeeId, from (YYYY-MM-DD), to (YYYY-MM-DD)
 *
 * staff-roster:
 *   stationId, role (SUPERVISOR|TICKETER|CASHIER), sex (MALE|FEMALE)
 *
 * pos-fleet:
 *   stationId, status (ACTIVE|IDLE|MAINTENANCE|DECOMMISSIONED), appVersion
 *
 * station-summary:
 *   region
 */
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, "reports", "view");
  if ("error" in auth) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");

    switch (type) {
      case "fare-summary":
        return fareSummary(searchParams);
      case "petty-cash-ledger":
        return pettyCashLedger(searchParams);
      case "staff-roster":
        return staffRoster(searchParams);
      case "pos-fleet":
        return posFleet(searchParams);
      case "station-summary":
        return stationSummary(searchParams);
      default:
        return badRequest(
          "Missing or invalid `type` parameter.",
          { valid: ["fare-summary", "petty-cash-ledger", "staff-roster", "pos-fleet", "station-summary"] }
        );
    }
  } catch (error) {
    return serverError(error);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// REPORT: Fare Summary
// Joins terminals + fare matrix to produce route × busType × busLevel rows
// ─────────────────────────────────────────────────────────────────────────────

async function fareSummary(params: URLSearchParams) {
  const stationId = params.get("stationId");
  const busType = params.get("busType") as "BUS" | "MIDBUS" | "MINIBUS" | null;
  const busLevel = params.get("busLevel") as "LEVEL_1" | "LEVEL_2" | "LEVEL_3" | null;

  const [terminals, fareRows] = await Promise.all([
    prisma.terminal.findMany({
      where: {
        isDeleted: false,
        ...(stationId && { stationId }),
      },
      include: {
        station: { select: { id: true, code: true, name: true, region: true } },
        linkedStation: { select: { id: true, name: true } },
      },
      orderBy: [{ stationId: "asc" }, { createdAt: "asc" }],
    }),
    prisma.fareMatrix.findMany({
      where: {
        ...(busType && { busType }),
        ...(busLevel && { busLevel }),
      },
      orderBy: [{ busType: "asc" }, { busLevel: "asc" }],
    }),
  ]);

  const rows = [];

  for (const terminal of terminals) {
    const asphaltKm = Number(
      terminal.roadType === "ASPHALT"
        ? terminal.distanceKm
        : terminal.roadType === "MIXED"
        ? (terminal.asphaltKm ?? 0)
        : 0
    );
    const gravelKm = Number(
      terminal.roadType === "GRAVEL"
        ? terminal.distanceKm
        : terminal.roadType === "MIXED"
        ? (terminal.gravelKm ?? 0)
        : 0
    );

    for (const fare of fareRows) {
      const totalFare =
        Number(fare.asphaltRate) * asphaltKm + Number(fare.gravelRate) * gravelKm;

      rows.push({
        stationId: terminal.station.id,
        stationCode: terminal.station.code,
        stationName: terminal.station.name,
        stationRegion: terminal.station.region,
        terminalId: terminal.id,
        terminalName:
          terminal.isLinkedStation && terminal.linkedStation
            ? terminal.linkedStation.name
            : terminal.name,
        isLinkedStation: terminal.isLinkedStation,
        distanceKm: Number(terminal.distanceKm),
        roadType: terminal.roadType,
        asphaltKm,
        gravelKm,
        busType: fare.busType,
        busLevel: fare.busLevel,
        asphaltRate: Number(fare.asphaltRate),
        gravelRate: Number(fare.gravelRate),
        totalFare: Math.round(totalFare * 100) / 100,
      });
    }
  }

  const fares = rows.map((r) => r.totalFare);
  return ok({
    type: "fare-summary",
    data: rows,
    summary: {
      totalRoutes: rows.length,
      minFare: fares.length ? Math.min(...fares) : null,
      maxFare: fares.length ? Math.max(...fares) : null,
      avgFare: fares.length
        ? Math.round((fares.reduce((a, b) => a + b, 0) / fares.length) * 100) / 100
        : null,
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// REPORT: Petty Cash Ledger
// ─────────────────────────────────────────────────────────────────────────────

async function pettyCashLedger(params: URLSearchParams) {
  const stationId = params.get("stationId");
  const employeeId = params.get("employeeId");
  const from = params.get("from");
  const to = params.get("to");

  const records = await prisma.pettyCash.findMany({
    where: {
      ...(employeeId && { employeeId }),
      ...(stationId && {
        employee: { stationId, role: "SUPERVISOR" },
      }),
      ...(!employeeId &&
        !stationId && {
          employee: { role: "SUPERVISOR" },
        }),
      date: {
        ...(from && { gte: new Date(from) }),
        ...(to && { lte: new Date(to) }),
      },
    },
    include: {
      employee: {
        select: {
          id: true,
          code: true,
          firstName: true,
          lastName: true,
          role: true,
          station: { select: { id: true, name: true, code: true } },
        },
      },
    },
    orderBy: { date: "desc" },
  });

  const total = records.reduce((s, r) => s + Number(r.amount), 0);

  // Per-supervisor subtotals
  const byEmployee: Record<
    string,
    { employeeId: string; name: string; station: string; count: number; total: number }
  > = {};
  for (const r of records) {
    const key = r.employeeId;
    if (!byEmployee[key]) {
      byEmployee[key] = {
        employeeId: r.employee.id,
        name: `${r.employee.firstName} ${r.employee.lastName}`,
        station: r.employee.station?.name ?? "Unassigned",
        count: 0,
        total: 0,
      };
    }
    byEmployee[key].count += 1;
    byEmployee[key].total += Number(r.amount);
  }

  return ok({
    type: "petty-cash-ledger",
    data: records.map((r) => ({
      id: r.id,
      employeeId: r.employee.id,
      employeeCode: r.employee.code,
      employeeName: `${r.employee.firstName} ${r.employee.lastName}`,
      station: r.employee.station?.name ?? "Unassigned",
      stationId: r.employee.station?.id ?? null,
      amount: Number(r.amount),
      date: r.date,
      method: r.method,
      reference: r.reference,
      note: r.note,
      createdAt: r.createdAt,
    })),
    summary: {
      totalRecords: records.length,
      totalDisbursed: total,
      avgPerEntry: records.length ? Math.round((total / records.length) * 100) / 100 : 0,
      byEmployee: Object.values(byEmployee),
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// REPORT: Staff Roster
// ─────────────────────────────────────────────────────────────────────────────

async function staffRoster(params: URLSearchParams) {
  const stationId = params.get("stationId");
  const role = params.get("role") as "SUPERVISOR" | "TICKETER" | "CASHIER" | null;
  const sex = params.get("sex") as "MALE" | "FEMALE" | null;

  const employees = await prisma.employee.findMany({
    where: {
      isDeleted: false,
      ...(stationId && { stationId }),
      ...(role && { role }),
      ...(sex && { sex }),
    },
    include: {
      station: { select: { id: true, name: true, code: true } },
      posMachines: {
        where: { isDeleted: false },
        select: { id: true, code: true, serial: true },
      },
    },
    orderBy: [{ role: "asc" }, { lastName: "asc" }],
  });

  const totalSalary = employees.reduce((s, e) => s + Number(e.basicSalary), 0);

  return ok({
    type: "staff-roster",
    data: employees.map((e) => ({
      id: e.id,
      code: e.code,
      fullName: [e.firstName, e.middleName, e.lastName].filter(Boolean).join(" "),
      firstName: e.firstName,
      middleName: e.middleName,
      lastName: e.lastName,
      phone: e.phone,
      email: e.email,
      fan: e.fan,
      role: e.role,
      sex: e.sex,
      basicSalary: Number(e.basicSalary),
      accountNumber: e.accountNumber,
      employmentDate: e.employmentDate,
      stationId: e.stationId,
      stationName: e.station?.name ?? null,
      stationCode: e.station?.code ?? null,
      posMachines: e.posMachines,
      createdAt: e.createdAt,
    })),
    summary: {
      totalEmployees: employees.length,
      byRole: {
        SUPERVISOR: employees.filter((e) => e.role === "SUPERVISOR").length,
        TICKETER: employees.filter((e) => e.role === "TICKETER").length,
        CASHIER: employees.filter((e) => e.role === "CASHIER").length,
      },
      bySex: {
        MALE: employees.filter((e) => e.sex === "MALE").length,
        FEMALE: employees.filter((e) => e.sex === "FEMALE").length,
      },
      withPOS: employees.filter((e) => e.posMachines.length > 0).length,
      withoutPOS: employees.filter((e) => e.posMachines.length === 0).length,
      totalSalary,
      avgSalary:
        employees.length
          ? Math.round((totalSalary / employees.length) * 100) / 100
          : 0,
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// REPORT: POS Fleet
// ─────────────────────────────────────────────────────────────────────────────

async function posFleet(params: URLSearchParams) {
  const stationId = params.get("stationId");
  const status = params.get("status") as
    | "ACTIVE" | "IDLE" | "MAINTENANCE" | "DECOMMISSIONED"
    | null;
  const appVersion = params.get("appVersion");

  // Resolve latest version from system config
  const latestVersionConfig = await prisma.systemConfig.findUnique({
    where: { key: "pos_latest_app_version" },
    select: { value: true },
  });
  const latestVersion = latestVersionConfig?.value ?? null;

  const machines = await prisma.posMachine.findMany({
    where: {
      isDeleted: false,
      ...(stationId && { stationId }),
      ...(status && { status }),
      ...(appVersion && { appVersion }),
    },
    include: {
      station: { select: { id: true, name: true, code: true } },
      employee: { select: { id: true, code: true, firstName: true, lastName: true } },
      history: {
        where: { toDate: null },
        select: { fromDate: true },
        take: 1,
      },
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });

  return ok({
    type: "pos-fleet",
    latestVersion,
    data: machines.map((m) => ({
      id: m.id,
      code: m.code,
      serial: m.serial,
      make: m.make,
      model: m.model,
      status: m.status,
      appVersion: m.appVersion,
      isUpToDate: latestVersion ? m.appVersion === latestVersion : null,
      remark: m.remark,
      stationId: m.stationId,
      stationName: m.station?.name ?? null,
      stationCode: m.station?.code ?? null,
      employeeId: m.employeeId,
      employeeName: m.employee
        ? `${m.employee.firstName} ${m.employee.lastName}`
        : null,
      employeeCode: m.employee?.code ?? null,
      currentAssignmentSince: m.history[0]?.fromDate ?? null,
      createdAt: m.createdAt,
    })),
    summary: {
      total: machines.length,
      byStatus: {
        ACTIVE: machines.filter((m) => m.status === "ACTIVE").length,
        IDLE: machines.filter((m) => m.status === "IDLE").length,
        MAINTENANCE: machines.filter((m) => m.status === "MAINTENANCE").length,
        DECOMMISSIONED: machines.filter((m) => m.status === "DECOMMISSIONED").length,
      },
      outdated: latestVersion
        ? machines.filter((m) => m.appVersion !== latestVersion).length
        : null,
      unassigned: machines.filter((m) => !m.employeeId).length,
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// REPORT: Station Summary
// ─────────────────────────────────────────────────────────────────────────────

async function stationSummary(params: URLSearchParams) {
  const region = params.get("region") as
    | "ADDIS_ABABA" | "OROMIA" | "AMHARA" | "TIGRAY" | "SNNPR"
    | "AFAR" | "SOMALI" | "BENISHANGUL_GUMUZ" | "GAMBELA"
    | "HARARI" | "DIRE_DAWA" | "SIDAMA"
    | null;

  const stations = await prisma.station.findMany({
    where: {
      isDeleted: false,
      ...(region && { region }),
    },
    include: {
      _count: {
        select: {
          terminalsAsOrigin: { where: { isDeleted: false } },
          employees: { where: { isDeleted: false } },
          posMachines: { where: { isDeleted: false } },
        },
      },
      terminalsAsOrigin: {
        where: { isDeleted: false },
        select: { distanceKm: true, roadType: true },
      },
      employees: {
        where: { isDeleted: false },
        select: {
          role: true,
          basicSalary: true,
          pettyCash: { select: { amount: true } },
        },
      },
      posMachines: {
        where: { isDeleted: false },
        select: { status: true },
      },
    },
    orderBy: [{ region: "asc" }, { name: "asc" }],
  });

  const data = stations.map((s) => {
    const totalSalary = s.employees.reduce((sum, e) => sum + Number(e.basicSalary), 0);
    const totalPettyCash = s.employees.reduce(
      (sum, e) => sum + e.pettyCash.reduce((ps, p) => ps + Number(p.amount), 0),
      0
    );
    const totalKm = s.terminalsAsOrigin.reduce(
      (sum, t) => sum + Number(t.distanceKm),
      0
    );

    return {
      id: s.id,
      code: s.code,
      name: s.name,
      region: s.region,
      zone: s.zone,
      location: s.location,
      terminalCount: s._count.terminalsAsOrigin,
      employeeCount: s._count.employees,
      posMachineCount: s._count.posMachines,
      supervisorCount: s.employees.filter((e) => e.role === "SUPERVISOR").length,
      activePosCount: s.posMachines.filter((m) => m.status === "ACTIVE").length,
      totalDistanceKm: Math.round(totalKm * 100) / 100,
      monthlySalary: totalSalary,
      totalPettyCash,
    };
  });

  const grandSalary = data.reduce((s, d) => s + d.monthlySalary, 0);
  const grandPettyCash = data.reduce((s, d) => s + d.totalPettyCash, 0);

  return ok({
    type: "station-summary",
    data,
    summary: {
      totalStations: data.length,
      totalEmployees: data.reduce((s, d) => s + d.employeeCount, 0),
      totalPosMachines: data.reduce((s, d) => s + d.posMachineCount, 0),
      totalTerminals: data.reduce((s, d) => s + d.terminalCount, 0),
      grandMonthlySalary: grandSalary,
      grandPettyCash,
    },
  });
}