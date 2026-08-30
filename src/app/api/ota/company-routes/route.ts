// src/app/api/ota/company-routes/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/api-auth";
import { ok, toNumber, serverError } from "@/lib/api-utils";

function normalizeName(s: string): string {
  return s.toLowerCase().replace(/\s+/g, "");
}

/**
 * GET /api/ota/company-routes
 * The company's own departure terminals and every registered destination
 * route from each (with distance), grouped by terminal — powers both the
 * Stations page's "our 16 departure terminals" view and the Terminals
 * page's literal + visual route-network mapping. Recomputes the
 * operational-Station match live (name-normalized) on every read rather
 * than storing it, so it never goes stale as Stations get added later.
 */
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, "ota-terminals", "view");
  if ("error" in auth) return auth.error;

  try {
    const [routes, stations, lastSync] = await Promise.all([
      prisma.otaCompanyRoute.findMany({ orderBy: [{ departureTerminalName: "asc" }, { arrivalTerminalName: "asc" }] }),
      prisma.station.findMany({ where: { isDeleted: false }, select: { id: true, name: true, code: true } }),
      prisma.otaSyncLog.findFirst({
        where: { entity: "COMPANY_ROUTES", status: { in: ["SUCCESS", "PARTIAL"] }, finishedAt: { not: null } },
        orderBy: { finishedAt: "desc" },
      }),
    ]);

    const stationByNormalizedName = new Map(stations.map((s) => [normalizeName(s.name), s]));

    const byTerminal = new Map<string, { id: string; name: string; destinations: { id: string; arrivalTerminalId: string; arrivalTerminalName: string; distanceKm: number; roadType: string | null }[] }>();
    for (const r of routes) {
      const entry = byTerminal.get(r.departureTerminalId) ?? { id: r.departureTerminalId, name: r.departureTerminalName, destinations: [] };
      entry.destinations.push({
        id: r.id,
        arrivalTerminalId: r.arrivalTerminalId,
        arrivalTerminalName: r.arrivalTerminalName,
        distanceKm: toNumber(r.distanceKm),
        roadType: r.roadType,
      });
      byTerminal.set(r.departureTerminalId, entry);
    }

    const terminals = [...byTerminal.values()]
      .map((t) => {
        const station = stationByNormalizedName.get(normalizeName(t.name)) ?? null;
        const totalDistanceKm = t.destinations.reduce((sum, d) => sum + d.distanceKm, 0);
        return {
          id: t.id,
          name: t.name,
          station,
          destinationCount: t.destinations.length,
          totalDistanceKm,
          destinations: t.destinations.sort((a, b) => a.distanceKm - b.distanceKm),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    return ok({
      terminals,
      totalRoutes: routes.length,
      lastSync: lastSync ? { finishedAt: lastSync.finishedAt, status: lastSync.status } : null,
    });
  } catch (error) {
    return serverError(error);
  }
}
