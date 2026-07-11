// src/app/api/employees/bulk/route.ts
import { NextRequest } from "next/server";
import { ZodSafeParseSuccess } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-auth";
import {
  badRequest,
  created,
  serverError,
  serializeEmployee,
  generateEmployeeCode,
} from "@/lib/api-utils";
import { createEmployeeSchema, CreateEmployeeInput } from "@/lib/schemas/employee";

const employeeInclude = {
  station: { select: { id: true, name: true, code: true } },
  posMachines: {
    where: { isDeleted: false },
    select: { id: true, code: true, serial: true },
  },
} as const;

function getDuplicates(values: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    else seen.add(value);
  }
  return Array.from(duplicates);
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if ("error" in auth) return auth.error;

  try {
    const body = await request.json();

    if (!Array.isArray(body)) {
      return badRequest("Request body must be an array.");
    }

    if (body.length === 0) {
      return badRequest("Employee list cannot be empty.");
    }

    type Validated = { index: number; parsed: ZodSafeParseSuccess<CreateEmployeeInput> };

    const validation = body.map((employee, index) => ({
      index,
      parsed: createEmployeeSchema.safeParse(employee),
    }));

    const isSuccess = (
      v: (typeof validation)[number]
    ): v is Validated => v.parsed.success;

    const validationErrors = validation
      .filter(v => !isSuccess(v))
      .map(v => ({
        index: v.index,
        errors: v.parsed.error?.flatten(),
      }));

    if (validationErrors.length > 0) {
      return badRequest("Validation failed.", validationErrors);
    }

    const employees = validation.filter(isSuccess).map(v => v.parsed.data);

    const phones = employees.map(e => e.phone);
    const duplicatePhones = getDuplicates(phones);
    if (duplicatePhones.length > 0) {
      return badRequest("Duplicate phone numbers found in request.", {
        duplicatePhones,
      });
    }

    const emails = employees
      .map(e => e.email)
      .filter((email): email is string => Boolean(email));
    const duplicateEmails = getDuplicates(emails);
    if (duplicateEmails.length > 0) {
      return badRequest("Duplicate emails found in request.", {
        duplicateEmails,
      });
    }

    const fans = employees
      .map(e => e.fan)
      .filter((fan): fan is string => Boolean(fan));
    const duplicateFans = getDuplicates(fans);
    if (duplicateFans.length > 0) {
      return badRequest("Duplicate FAN numbers found in request.", {
        duplicateFans,
      });
    }

    const existingInDb = await prisma.employee.findMany({
      where: {
        OR: [
          { phone: { in: phones } },
          ...(emails.length > 0 ? [{ email: { in: emails } }] : []),
          ...(fans.length > 0 ? [{ fan: { in: fans } }] : []),
        ],
      },
      select: { phone: true, email: true, fan: true },
    });

    if (existingInDb.length > 0) {
      return badRequest("Some employees already exist.", {
        existing: existingInDb.map(e => ({
          phone: e.phone,
          email: e.email,
          fan: e.fan,
        })),
      });
    }

    // Generate sequential codes up-front so each record gets a unique code.
    const codes: string[] = [];
    let nextNumber = await generateEmployeeCode().then(code => {
      const match = code.match(/EMP-(\d+)/);
      return match ? parseInt(match[1], 10) : 1;
    });
    for (let i = 0; i < employees.length; i++) {
      codes.push(`EMP-${String(nextNumber).padStart(3, "0")}`);
      nextNumber += 1;
    }

    const createdEmployees = await prisma.$transaction(
      employees.map((employee, index) => {
        const { employmentDate, email, fan, ...rest } = employee;
        const code = codes[index];

        return prisma.employee.create({
          data: {
            code,
            ...rest,
            email: email || null,
            fan: fan || null,
            employmentDate: employmentDate ? new Date(employmentDate) : null,
          },
          include: employeeInclude,
        });
      })
    );

    return created({
      count: createdEmployees.length,
      data: createdEmployees.map(serializeEmployee),
    });
  } catch (error) {
    return serverError(error);
  }
}
