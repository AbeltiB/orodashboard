// src/app/api/auth/logout/route.ts
import { NextRequest, NextResponse } from "next/server";
import { serverError } from "@/lib/api-utils";
import { getSessionByToken, revokeSession, SESSION_COOKIE } from "@/lib/session";

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get(SESSION_COOKIE)?.value;
    if (token) {
      const session = await getSessionByToken(token);
      if (session) await revokeSession(session.sessionId);
    }

    const res = NextResponse.json({ message: "Signed out." }, { status: 200 });
    res.cookies.delete(SESSION_COOKIE);
    return res;
  } catch (error) {
    return serverError(error);
  }
}
