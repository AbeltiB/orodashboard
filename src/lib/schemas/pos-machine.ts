// src/lib/schemas/pos-machine.ts
import { z } from "zod";
import { POS_STATUS_VALUES } from "@/lib/api-utils";

export const createPosMachineSchema = z.object({
  make: z.string().min(1).max(100),
  model: z.string().min(1).max(100),
  serial: z.string().min(1).max(100),
  appVersion: z.string().min(1).max(100),
  status: z.enum(POS_STATUS_VALUES).default("ACTIVE"),
  remark: z.string().max(500).optional(),
  assignmentMode: z.enum(["EXCLUSIVE", "SHARED"]).default("EXCLUSIVE"),
  stationId: z.string().cuid().optional(),
  employeeId: z.string().cuid().optional(),
});

// employeeId is deliberately excluded from updates — custody changes must go
// through /assign (EXCLUSIVE machines) or /sessions (SHARED machines), never
// a silent PATCH, so PosMachineHistory/PosSession stay trustworthy.
// assignmentMode is excluded too — switching modes needs the transactional
// cleanup in POST /mode, not a bare field update.
export const updatePosMachineSchema = createPosMachineSchema
  .omit({ employeeId: true, assignmentMode: true })
  .partial();

export const assignPosMachineSchema = z.object({
  employeeId: z.string().cuid().nullable(),
  stationId: z.string().cuid().nullable(),
  fromDate: z.string().date(),
  remark: z.string().max(500).optional(),
});

export type CreatePosMachineInput = z.infer<typeof createPosMachineSchema>;
export type UpdatePosMachineInput = z.infer<typeof updatePosMachineSchema>;
export type AssignPosMachineInput = z.infer<typeof assignPosMachineSchema>;