// src/app/api/auth/me/route.ts
import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { ok, serverError } from "@/lib/api-utils";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if ("error" in auth) return auth.error;

  try {
    const { session } = auth;
    return ok({
      id: session.adminUserId,
      firstName: session.firstName,
      middleName: session.middleName,
      lastName: session.lastName,
      phone: session.phone,
      role: session.role,
      permissions: session.permissions,
    });
  } catch (error) {
    return serverError(error);
  }
}
