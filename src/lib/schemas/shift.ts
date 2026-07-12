// src/lib/schemas/shift.ts
import { z } from "zod";
import { SHIFT_TYPE_VALUES, EMPLOYEE_ROLE_VALUES } from "@/lib/api-utils";

export const createShiftSchema = z.object({
  employeeId: z.string().cuid(),
  stationId: z.string().cuid(),
  date: z.string().date(),
  shiftType: z.enum(SHIFT_TYPE_VALUES),
  role: z.enum(EMPLOYEE_ROLE_VALUES),
  posMachineId: z.string().cuid().optional(),
});

export const updateShiftSchema = createShiftSchema.omit({ employeeId: true, date: true, shiftType: true }).partial();

// One row of an imported schedule, before code->id resolution.
export const shiftImportRowSchema = z.object({
  employee_code: z.string().min(1),
  station_code: z.string().min(1),
  date: z.string().date(),
  shift: z.enum(SHIFT_TYPE_VALUES),
  role: z.enum(EMPLOYEE_ROLE_VALUES),
  pos_machine_code: z.string().min(1).optional(),
});

// The raw upload — content is either CSV text or a JSON array of row objects.
// Which one is parsed by src/lib/shift-import.ts based on fileName's extension.
export const importShiftsSchema = z.object({
  fileName: z.string().min(1).max(255),
  content: z.string().min(1).max(2_000_000),
});

export type CreateShiftInput = z.infer<typeof createShiftSchema>;
export type UpdateShiftInput = z.infer<typeof updateShiftSchema>;
export type ShiftImportRow = z.infer<typeof shiftImportRowSchema>;
