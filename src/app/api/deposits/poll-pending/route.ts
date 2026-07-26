// src/app/api/deposits/poll-pending/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/api-auth";
import { ok, unauthorized, serverError } from "@/lib/api-utils";
import { pollPendingDeposit } from "@/lib/deposits";

/**
 * POST /api/deposits/poll-pending
 * Fallback reconciliation sweep for every Deposit stuck in SUBMITTED (i.e.
 * verify.et hadn't completed within our synchronous wait window at submit
 * time). Two ways in, mirroring /api/sales/sync:
 *  - `x-sync-token` header matching DEPOSIT_POLL_TOKEN -> for an external
 *    cron trigger to call every few minutes.
 *  - An authenticated admin session with deposits edit access -> manual
 *    "Refresh all pending" button.
 */
export async function POST(request: NextRequest) {
  const tokenHeader = request.headers.get("x-sync-token");
  const expectedToken = process.env.DEPOSIT_POLL_TOKEN;

  if (tokenHeader) {
    if (!expectedToken || tokenHeader !== expectedToken) {
      return unauthorized("Invalid sync token.");
    }
  } else {
    const auth = await requirePermission(request, "deposits", "edit");
    if ("error" in auth) return auth.error;
  }

  try {
    const pending = await prisma.deposit.findMany({
      where: { status: "SUBMITTED", verifyRequestId: { not: null } },
      select: { id: true },
    });

    let resolved = 0;
    let stillPending = 0;
    let failed = 0;

    for (const { id } of pending) {
      try {
        const updated = await pollPendingDeposit(id);
        if (updated.status === "SUBMITTED") stillPending++;
        else resolved++;
      } catch {
        failed++;
      }
    }

    return ok({ checked: pending.length, resolved, stillPending, failed });
  } catch (error) {
    return serverError(error);
  }
}
