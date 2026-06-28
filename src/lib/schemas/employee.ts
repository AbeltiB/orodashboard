// src/lib/schemas/employee.ts
import { z } from "zod";
import {
  EMPLOYEE_ROLE_VALUES,
  SEX_VALUES,
  DELIVERY_METHOD_VALUES,
} from "@/lib/api-utils";

export const createEmployeeSchema = z.object({
  firstName: z.string().min(1).max(100),
  middleName: z.string().max(100).optional(),
  lastName: z.string().min(1).max(100),
  phone: z
    .string()
    .regex(/^\+251[79]\d{8}$/, "Phone must be in +251XXXXXXXXX format"),
  email: z.email().optional().or(z.literal("")),
  fan: z
    .string()
    .regex(/^\d{16}$/, "FAN must be exactly 16 digits")
    .optional()
    .or(z.literal("")),
  posPassword: z.string().max(100).optional(),
  stationId: z.string().cuid().optional(),
  role: z.enum(EMPLOYEE_ROLE_VALUES),
  sex: z.enum(SEX_VALUES),
  basicSalary: z.number().positive(),
  accountNumber: z.string().max(50).optional(),
  employmentDate: z.string().date().optional(), // "YYYY-MM-DD"
});

export const updateEmployeeSchema = createEmployeeSchema.partial();

// Petty cash — only supervisors; validated in the route handler
export const createPettyCashSchema = z.object({
  amount: z.number().positive(),
  date: z.string().date(),
  method: z.enum(DELIVERY_METHOD_VALUES),
  reference: z.string().min(1).max(200),
  note: z.string().max(500).optional(),
});

export const updatePettyCashSchema = createPettyCashSchema.partial();

export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;
export type CreatePettyCashInput = z.infer<typeof createPettyCashSchema>;