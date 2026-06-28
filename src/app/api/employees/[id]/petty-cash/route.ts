// src/app/api/employees/[id]/petty-cash/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-auth";
import {
  badRequest,
  created,
  notFound,
  ok,
  serverError,
} from "@/lib/api-utils";
import { createPettyCashSchema } from "@/lib/schemas/employee";

type Context = { params: Promise<{ id: string }> };

function serializePettyCash(p: {
  id: string;
  amount: unknown;
  date: Date;
  method: string;
  reference: string;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: p.id,
    amount: Number(p.amount),
    date: p.date,
    method: p.method,
    reference: p.reference,
    note: p.note,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

export async function GET(request: NextRequest, context: Context) {
  const auth = requireAuth(request);
  if (auth) return auth;

  try {
    const { id } = await context.params;
    const { searchParams } = new URL(request.url);

    const employee = await prisma.employee.findUnique({
      where: { id },
      select: { id: true, role: true },
    });
    if (!employee) return notFound("Employee");

    const fromDate = searchParams.get("from");
    const toDate = searchParams.get("to");

    const records = await prisma.pettyCash.findMany({
      where: {
        employeeId: id,
        ...(fromDate && { date: { gte: new Date(fromDate) } }),
        ...(toDate && { date: { lte: new Date(toDate) } }),
      },
      orderBy: { date: "desc" },
    });

    const total = records.reduce((sum, r) => sum + Number(r.amount), 0);

    return ok({
      data: records.map(serializePettyCash),
      meta: { total, count: records.length },
    });
  } catch (error) {
    return serverError(error);
  }
}

export async function POST(request: NextRequest, context: Context) {
  const auth = requireAuth(request);
  if (auth) return auth;

  try {
    const { id } = await context.params;
    const body = await request.json();
    const parsed = createPettyCashSchema.safeParse(body);
    if (!parsed.success) return badRequest("Invalid request body.", parsed.error.flatten());

    const employee = await prisma.employee.findUnique({
      where: { id },
      select: { id: true, role: true, isDeleted: true },
    });
    if (!employee) return notFound("Employee");
    if (employee.isDeleted) return badRequest("Cannot add petty cash to a deleted employee.");
    if (employee.role !== "SUPERVISOR") {
      return badRequest("Petty cash can only be disbursed to Supervisors.");
    }

    const { date, ...rest } = parsed.data;
    const record = await prisma.pettyCash.create({
      data: { employeeId: id, date: new Date(date), ...rest },
    });

    return created(serializePettyCash(record));
  } catch (error) {
    return serverError(error);
  }
}