// src/lib/schemas/zone.ts
import { z } from "zod";
import { REGION_VALUES } from "@/lib/api-utils";

export const createZoneSchema = z.object({
  region: z.enum(REGION_VALUES),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
});

export const updateZoneSchema = createZoneSchema.partial();

export const addZoneSupervisorSchema = z.object({
  employeeId: z.string().cuid(),
});

export type CreateZoneInput = z.infer<typeof createZoneSchema>;
export type UpdateZoneInput = z.infer<typeof updateZoneSchema>;
