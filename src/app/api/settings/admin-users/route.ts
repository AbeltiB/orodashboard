// src/app/api/settings/admin-users/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-auth";
import { badRequest, conflict, created, ok, serverError } from "@/lib/api-utils";
import { createAdminUserSchema } from "@/lib/schemas/settings";
import { hashPin } from "@/lib/pin";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if ("error" in auth) return auth.error;

  try {
    const users = await prisma.adminUser.findMany({
      select: {
        id: true, name: true, phone: true, isActive: true, createdAt: true, updatedAt: true,
        // Never return the PIN hash
      },
      orderBy: { createdAt: "asc" },
    });

    return ok({ data: users });
  } catch (error) {
    return serverError(error);
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
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

    const hashedPin = await hashPin(parsed.data.pin);

    const user = await prisma.adminUser.create({
      data: { name: parsed.data.name, phone: parsed.data.phone, pin: hashedPin },
      select: { id: true, name: true, phone: true, isActive: true, createdAt: true, updatedAt: true },
    });

    return created(user);
  } catch (error) {
    return serverError(error);
  }
}