// src/app/api/settings/admin-users/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { badRequest, conflict, created, ok, serverError } from "@/lib/api-utils";
import { createAdminUserSchema } from "@/lib/schemas/settings";
import { defaultPermissionsForRole } from "@/lib/permissions";

// Never select otpCodeHash — that's the only sensitive field on this model.
const safeSelect = {
  id: true,
  firstName: true,
  middleName: true,
  lastName: true,
  phone: true,
  companyEmail: true,
  personalEmail: true,
  role: true,
  isActive: true,
  permissions: true,
  lastLoginAt: true,
  lockedUntil: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, ["SUPER_ADMIN"]);
  if ("error" in auth) return auth.error;

  try {
    const users = await prisma.adminUser.findMany({
      select: safeSelect,
      orderBy: { createdAt: "asc" },
    });

    return ok({ data: users });
  } catch (error) {
    return serverError(error);
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, ["SUPER_ADMIN"]);
  if ("error" in auth) return auth.error;

  try {
    const body = await request.json();
    const parsed = createAdminUserSchema.safeParse(body);
    if (!parsed.success) return badRequest("Invalid request body.", parsed.error.flatten());

    const existing = await prisma.adminUser.findUnique({
      where: { phone: parsed.data.phone },
      select: { id: true },
    });
    if (existing) return conflict("An admin user with this phone number already exists.");

    const { permissions, ...rest } = parsed.data;

    const user = await prisma.adminUser.create({
      data: {
        ...rest,
        permissions: permissions ?? defaultPermissionsForRole(parsed.data.role),
      },
      select: safeSelect,
    });

    return created(user);
  } catch (error) {
    return serverError(error);
  }
}
