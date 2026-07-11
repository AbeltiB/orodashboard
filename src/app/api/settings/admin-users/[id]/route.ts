// src/app/api/settings/admin-users/[id]/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { badRequest, conflict, notFound, ok, serverError } from "@/lib/api-utils";
import { updateAdminUserSchema } from "@/lib/schemas/settings";
import { revokeAllSessionsForUser } from "@/lib/session";

type Context = { params: Promise<{ id: string }> };

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

// True if `excludeId` is the only remaining active super admin — i.e. removing
// or demoting/deactivating them would leave the system with none.
async function isLastActiveSuperAdmin(excludeId: string): Promise<boolean> {
  const otherActiveSuperAdmins = await prisma.adminUser.count({
    where: { role: "SUPER_ADMIN", isActive: true, id: { not: excludeId } },
  });
  return otherActiveSuperAdmins === 0;
}

export async function GET(request: NextRequest, context: Context) {
  const auth = await requireRole(request, ["SUPER_ADMIN"]);
  if ("error" in auth) return auth.error;

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
  const auth = await requireRole(request, ["SUPER_ADMIN"]);
  if ("error" in auth) return auth.error;

  try {
    const { id } = await context.params;
    const body = await request.json();
    const parsed = updateAdminUserSchema.safeParse(body);
    if (!parsed.success) return badRequest("Invalid request body.", parsed.error.flatten());

    const existing = await prisma.adminUser.findUnique({ where: { id } });
    if (!existing) return notFound("Admin user");

    const isSelf = id === auth.session.adminUserId;
    const wasLastSuperAdmin = existing.role === "SUPER_ADMIN" && (await isLastActiveSuperAdmin(id));

    if (isSelf && parsed.data.isActive === false) {
      return badRequest("You cannot deactivate your own account.");
    }
    if (wasLastSuperAdmin && parsed.data.isActive === false) {
      return conflict("You cannot deactivate the last active super admin.");
    }
    if (wasLastSuperAdmin && parsed.data.role && parsed.data.role !== "SUPER_ADMIN") {
      return conflict("You cannot change the role of the last active super admin.");
    }

    if (parsed.data.phone) {
      const phoneConflict = await prisma.adminUser.findFirst({
        where: { phone: parsed.data.phone, id: { not: id } },
        select: { id: true },
      });
      if (phoneConflict) return conflict("Phone number is already used by another admin.");
    }

    const user = await prisma.adminUser.update({
      where: { id },
      data: parsed.data,
      select: safeSelect,
    });

    // Deactivating an admin should end their access immediately, not just on
    // their session's natural 7-day expiry.
    if (parsed.data.isActive === false) {
      await revokeAllSessionsForUser(id);
    }

    return ok(user);
  } catch (error) {
    return serverError(error);
  }
}

export async function DELETE(request: NextRequest, context: Context) {
  const auth = await requireRole(request, ["SUPER_ADMIN"]);
  if ("error" in auth) return auth.error;

  try {
    const { id } = await context.params;
    const existing = await prisma.adminUser.findUnique({ where: { id } });
    if (!existing) return notFound("Admin user");

    if (id === auth.session.adminUserId) {
      return badRequest("You cannot delete your own account.");
    }
    if (existing.role === "SUPER_ADMIN" && (await isLastActiveSuperAdmin(id))) {
      return conflict("You cannot delete the last active super admin.");
    }

    // Hard delete — sessions cascade via the Session.adminUser relation.
    await prisma.adminUser.delete({ where: { id } });
    return ok({ message: "Admin user deleted.", id });
  } catch (error) {
    return serverError(error);
  }
}
