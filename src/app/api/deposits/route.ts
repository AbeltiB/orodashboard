// src/app/api/deposits/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { requirePermission } from "@/lib/api-auth";
import { dateRangeFilter, ok, parsePagination, toNumber, serverError } from "@/lib/api-utils";
import { serializeDeposit } from "@/lib/deposits";

/**
 * GET /api/deposits
 * Admin reconciliation list — filter by date range / terminal / status.
 * Query params: dateFrom, dateTo, terminalId, status, offset, limit.
 */
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, "deposits", "view");
  if ("error" in auth) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const { offset, limit } = parsePagination(searchParams, 50, 500);

    const dateFrom = searchParams.get("dateFrom")?.trim();
    const dateTo = searchParams.get("dateTo")?.trim();
    const terminalId = searchParams.get("terminalId")?.trim();
    const status = searchParams.get("status")?.trim();

    const where: Prisma.DepositWhereInput = {};
    const dateFilter = dateRangeFilter(dateFrom, dateTo);
    if (dateFilter) where.date = dateFilter;
    if (terminalId) where.terminalId = terminalId;
    if (status) where.status = status as Prisma.DepositWhereInput["status"];

    const [deposits, total, statusCounts, sums] = await Promise.all([
      prisma.deposit.findMany({
        where,
        include: {
          employee: { select: { id: true, code: true, firstName: true, lastName: true } },
          terminal: { select: { id: true, name: true } },
        },
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        skip: offset,
        take: limit,
      }),
      prisma.deposit.count({ where }),
      prisma.deposit.groupBy({ by: ["status"], where, _count: { _all: true } }),
      prisma.deposit.aggregate({
        where,
        _sum: { expectedAmount: true, verifiedAmount: true },
      }),
    ]);

    return ok({
      data: deposits.map(serializeDeposit),
      meta: { total, offset, limit, hasMore: offset + deposits.length < total },
      stats: {
        byStatus: Object.fromEntries(statusCounts.map((s) => [s.status, s._count._all])),
        totalExpected: toNumber(sums._sum.expectedAmount ?? 0),
        totalVerified: toNumber(sums._sum.verifiedAmount ?? 0),
      },
    });
  } catch (error) {
    return serverError(error);
  }
}
