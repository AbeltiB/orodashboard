// src/app/api/cashier/sales/sync/route.ts
import { NextRequest } from "next/server";
import { requireCashierAuth } from "@/lib/cashier-auth";
import { ok, serverError } from "@/lib/api-utils";
import { runSalesSync } from "@/lib/ota/sync";

// A full walk can take a few minutes when there's genuinely new data — give
// this route the same headroom as the admin sync endpoint.
export const maxDuration = 300;

/**
 * POST /api/cashier/sales/sync
 * Lets a cashier pull the latest trips on demand — e.g. right when a
 * ticketer's shift ends, so the reconciliation numbers are current instead
 * of waiting for the next scheduled sync. Reuses the same self-governing
 * sync (skips instantly if the source's row count hasn't moved, skips if a
 * run is already in progress) — no separate rate-limit concern here beyond
 * what already protects the admin "Sync now" button.
 */
export async function POST(request: NextRequest) {
  const auth = await requireCashierAuth(request);
  if ("error" in auth) return auth.error;

  try {
    const result = await runSalesSync({ source: "MANUAL", triggeredBy: null });
    return ok(result);
  } catch (error) {
    return serverError(error);
  }
}
