// src/app/api/cashier/auth/logout/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireCashierAuth } from "@/lib/cashier-auth";
import { revokeCashierSession, CASHIER_SESSION_COOKIE } from "@/lib/cashier-session";
import { serverError } from "@/lib/api-utils";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireCashierAuth(request);
    if ("session" in auth) {
      await revokeCashierSession(auth.session.sessionId);
    }
    const res = NextResponse.json({ message: "Signed out." }, { status: 200 });
    res.cookies.delete(CASHIER_SESSION_COOKIE);
    return res;
  } catch (error) {
    return serverError(error);
  }
}
