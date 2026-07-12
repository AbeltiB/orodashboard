// src/lib/schemas/pos-session.ts
import { z } from "zod";

export const startPosSessionSchema = z.object({
  employeeId: z.string().cuid(),
  note: z.string().max(500).optional(),
});

export const endPosSessionSchema = z.object({
  note: z.string().max(500).optional(),
});

export const switchPosModeSchema = z.object({
  assignmentMode: z.enum(["EXCLUSIVE", "SHARED"]),
});

export type StartPosSessionInput = z.infer<typeof startPosSessionSchema>;
export type SwitchPosModeInput = z.infer<typeof switchPosModeSchema>;
