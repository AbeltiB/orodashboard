// src/app/api/cashier/auth/me/route.ts
import { NextRequest } from "next/server";
import { requireCashierAuth } from "@/lib/cashier-auth";
import { ok, serverError } from "@/lib/api-utils";
import { getCashierAssignedStations } from "@/lib/cashier-sales-scope";

export async function GET(request: NextRequest) {
  const auth = await requireCashierAuth(request);
  if ("error" in auth) return auth.error;

  try {
    const stations = await getCashierAssignedStations(auth.session.employeeId);
    return ok({
      employeeId: auth.session.employeeId,
      code: auth.session.code,
      fullName: [auth.session.firstName, auth.session.middleName, auth.session.lastName].filter(Boolean).join(" "),
      phone: auth.session.phone,
      stations,
    });
  } catch (error) {
    return serverError(error);
  }
}
