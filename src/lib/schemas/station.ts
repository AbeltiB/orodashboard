import { z } from "zod";
import { REGION_VALUES } from "@/lib/api-utils";
import { terminalInputSchema } from "./terminal";

export const stationBaseSchema = z.object({
  name: z.string().min(1).max(255),
  region: z.enum(REGION_VALUES),
  zoneId: z.string().cuid().nullable().optional(),
  location: z.string().min(1).max(500),
});

export const createStationSchema = stationBaseSchema.extend({
  terminals: z.array(terminalInputSchema).optional(),
});

export const updateStationSchema = stationBaseSchema.partial().extend({
  terminals: z.array(terminalInputSchema).optional(),
});

export type CreateStationInput = z.infer<typeof createStationSchema>;
export type UpdateStationInput = z.infer<typeof updateStationSchema>;
