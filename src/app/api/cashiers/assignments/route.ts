// src/app/api/cashiers/assignments/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/api-auth";
import { badRequest, created, notFound, ok, serverError } from "@/lib/api-utils";
import { assignCashierTerminalSchema } from "@/lib/schemas/cashier";

/**
 * POST /api/cashiers/assignments
 * Puts an existing employee (any role — the user picks who) in charge of a
 * terminal's deposits. Re-activates a previously-deactivated assignment
 * instead of erroring on the unique constraint if one already exists.
 */
export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, "cashiers", "edit");
  if ("error" in auth) return auth.error;

  try {
    const body = await request.json();
    const parsed = assignCashierTerminalSchema.safeParse(body);
    if (!parsed.success) return badRequest("Invalid request body.", parsed.error.flatten());

    const { employeeId, terminalId } = parsed.data;

    const [employee, terminal] = await Promise.all([
      prisma.employee.findUnique({ where: { id: employeeId }, select: { id: true, isDeleted: true } }),
      prisma.terminal.findUnique({ where: { id: terminalId }, select: { id: true, isDeleted: true } }),
    ]);
    if (!employee || employee.isDeleted) return notFound("Employee");
    if (!terminal || terminal.isDeleted) return notFound("Terminal");

    const assignment = await prisma.cashierTerminalAssignment.upsert({
      where: { employeeId_terminalId: { employeeId, terminalId } },
      create: { employeeId, terminalId, assignedBy: auth.session.adminUserId },
      update: { isActive: true, assignedBy: auth.session.adminUserId, assignedAt: new Date() },
      include: { terminal: { select: { id: true, name: true } } },
    });

    return created({
      id: assignment.id,
      employeeId: assignment.employeeId,
      terminal: assignment.terminal,
      isActive: assignment.isActive,
      assignedAt: assignment.assignedAt,
    });
  } catch (error) {
    return serverError(error);
  }
}

/**
 * GET /api/cashiers/assignments?employeeId=...
 * Assignment list for a single employee — used by the admin "manage
 * cashier" panel.
 */
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, "cashiers", "view");
  if ("error" in auth) return auth.error;

  try {
    const employeeId = new URL(request.url).searchParams.get("employeeId")?.trim();
    if (!employeeId) return badRequest("employeeId query param is required.");

    const assignments = await prisma.cashierTerminalAssignment.findMany({
      where: { employeeId },
      orderBy: { assignedAt: "desc" },
      include: { terminal: { select: { id: true, name: true } } },
    });

    return ok({ data: assignments });
  } catch (error) {
    return serverError(error);
  }
}
