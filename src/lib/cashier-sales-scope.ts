// src/lib/cashier-sales-scope.ts
// Resolves which SalesTrip.departureTerminalName values count as "this
// cashier's sales" — either every station they're assigned to, or (when a
// specific stationId is passed) just that one, matched primarily against
// the Station's own name rather than routed through Terminal records.
// Confirmed live: almost no Terminal rows actually exist for the real
// stations (OTA's reported departure names are effectively station names,
// not distinct terminal names), so requiring a Terminal match would
// silently scope a cashier to nothing. Terminal-resolved names are still
// included too, for whenever terminals do get set up (keeps this
// consistent with computeExpectedDeposit in src/lib/deposits.ts).
//
// Matching is case/whitespace-normalized (confirmed live: OTA reports at
// least one name, "haraqalloo", that only differs from the station's own
// "Hara Qalloo" by casing/spacing) — but NOT fuzzy/typo-tolerant, since that
// would risk silently merging two actually-different places. A handful of
// genuine spelling differences (e.g. "Asalla" vs OTA's "Asallaa") were
// corrected directly in the Station data instead.
import { prisma } from "./prisma";

function normalizeName(s: string): string {
  return s.toLowerCase().replace(/\s+/g, "");
}

// Everything cashier-sales-facing is station-wise now (a cashier covering
// several stations manages each one separately, not as one merged blob) —
// this is the shared "does this employee actually cover this station"
// check every scoped route runs before trusting a client-supplied stationId.
export async function assertCashierOwnsStation(employeeId: string, stationId: string): Promise<boolean> {
  const assignment = await prisma.cashierStationAssignment.findUnique({
    where: { employeeId_stationId: { employeeId, stationId }, isActive: true },
  });
  return !!assignment;
}

export async function getCashierStationMatchNames(employeeId: string, stationId?: string): Promise<string[]> {
  const assignments = await prisma.cashierStationAssignment.findMany({
    where: { employeeId, isActive: true, ...(stationId && { stationId }) },
    select: { stationId: true, station: { select: { name: true } } },
  });
  if (assignments.length === 0) return [];

  const stationIds = assignments.map((a) => a.stationId);
  const candidateNames = new Set(assignments.map((a) => normalizeName(a.station.name)));

  const terminals = await prisma.terminal.findMany({
    where: { stationId: { in: stationIds }, isDeleted: false },
    include: { linkedStation: { select: { name: true } } },
  });
  for (const t of terminals) {
    const name = t.isLinkedStation && t.linkedStation ? t.linkedStation.name : t.name;
    candidateNames.add(normalizeName(name));
  }

  // Resolve against the actual distinct strings SalesTrip has on file, so
  // callers can use the returned list directly in a plain `in` filter
  // without needing case/whitespace-insensitive SQL themselves.
  const distinctDepartures = await prisma.salesTrip.findMany({
    distinct: ["departureTerminalName"],
    select: { departureTerminalName: true },
  });

  return distinctDepartures
    .map((d) => d.departureTerminalName)
    .filter((name) => candidateNames.has(normalizeName(name)));
}

// Same name-matching as getCashierStationMatchNames, minus the cashier
// assignment requirement — for callers (Telegram station-scoped reports)
// that just need "what departureTerminalName values count as this station"
// given a stationId directly, with nobody's assignment to check.
export async function getStationMatchNames(stationId: string): Promise<string[]> {
  const station = await prisma.station.findUnique({ where: { id: stationId }, select: { name: true } });
  if (!station) return [];

  const candidateNames = new Set([normalizeName(station.name)]);

  const terminals = await prisma.terminal.findMany({
    where: { stationId, isDeleted: false },
    include: { linkedStation: { select: { name: true } } },
  });
  for (const t of terminals) {
    const name = t.isLinkedStation && t.linkedStation ? t.linkedStation.name : t.name;
    candidateNames.add(normalizeName(name));
  }

  const distinctDepartures = await prisma.salesTrip.findMany({
    distinct: ["departureTerminalName"],
    select: { departureTerminalName: true },
  });

  return distinctDepartures
    .map((d) => d.departureTerminalName)
    .filter((name) => candidateNames.has(normalizeName(name)));
}

export async function getCashierAssignedStations(employeeId: string) {
  const assignments = await prisma.cashierStationAssignment.findMany({
    where: { employeeId, isActive: true },
    include: { station: { select: { id: true, name: true, code: true } } },
    orderBy: { assignedAt: "desc" },
  });
  return assignments.map((a) => a.station);
}
