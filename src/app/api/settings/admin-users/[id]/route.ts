// src/app/api/settings/admin-users/[id]/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-auth";
import { badRequest, conflict, notFound, ok, serverError } from "@/lib/api-utils";
import { updateAdminUserSchema } from "@/lib/schemas/settings";
import { hashPin } from "@/lib/pin";

type Context = { params: Promise<{ id: string }> };

const safeSelect = {
  id: true, name: true, phone: true, isActive: true, createdAt: true, updatedAt: true,
} as const;

export async function GET(request: NextRequest, context: Context) {
  const auth = requireAuth(request);
  if (auth) return auth;

  try {
    const { id } = await context.params;
    const user = await prisma.adminUser.findUnique({ where: { id }, select: safeSelect });
    if (!user) return notFound("Admin user");
    return ok(user);
  } catch (error) {
    return serverError(error);
  }
}

export async function PATCH(request: NextRequest, context: Context) {
  const auth = requireAuth(request);
  if (auth) return auth;

  try {
    const { id } = await context.params;
    const body = await request.json();
    const parsed = updateAdminUserSchema.safeParse(body);
    if (!parsed.success) return badRequest("Invalid request body.", parsed.error.flatten());

    const existing = await prisma.adminUser.findUnique({ where: { id }, select: { id: true } });
    if (!existing) return notFound("Admin user");

    if (parsed.data.phone) {
      const conflict_ = await prisma.adminUser.findFirst({
        where: { phone: parsed.data.phone, id: { not: id } },
        select: { id: true },
      });
      if (conflict_) return conflict("Phone number is already used by another admin.");
    }

    const { pin, ...rest } = parsed.data;

    const user = await prisma.adminUser.update({
      where: { id },
      data: {
        ...rest,
        ...(pin && { pin: await hashPin(pin) }),
      },
      select: safeSelect,
    });

    return ok(user);
  } catch (error) {
    return serverError(error);
  }
}

export async function DELETE(request: NextRequest, context: Context) {
  const auth = requireAuth(request);
  if (auth) return auth;

  try {
    const { id } = await context.params;
    const existing = await prisma.adminUser.findUnique({ where: { id }, select: { id: true } });
    if (!existing) return notFound("Admin user");

    // Hard delete — admin user table doesn't use soft delete
    await prisma.adminUser.delete({ where: { id } });
    return ok({ message: "Admin user deleted.", id });
  } catch (error) {
    return serverError(error);
  }
}