import { z } from "zod";
import { ROAD_TYPE_INPUTS } from "@/lib/api-utils";

export const terminalInputSchema = z
  .object({
    id: z.string().cuid().optional(),
    name: z.string().min(1).max(255),
    isStation: z.boolean().default(false),
    linkedStationId: z.string().cuid().optional(),
    isDeparture: z.boolean().default(false),
    isArrival: z.boolean().default(true),
    distanceKm: z.number().nonnegative(),
    roadType: z.enum(ROAD_TYPE_INPUTS),
    asphaltKm: z.number().nonnegative().optional(),
    gravelKm: z.number().nonnegative().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.isStation && !data.linkedStationId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["linkedStationId"],
        message: "linkedStationId is required when isStation is true",
      });
    }

    if (data.roadType === "mixed") {
      if (data.asphaltKm === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["asphaltKm"],
          message: "asphaltKm is required when roadType is mixed",
        });
      }
      if (data.gravelKm === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["gravelKm"],
          message: "gravelKm is required when roadType is mixed",
        });
      }
    }
  });

export const createTerminalSchema = terminalInputSchema.extend({
  stationId: z.string().cuid(),
});

export const updateTerminalSchema = z
  .object({
    name: z.string().min(1).max(255).optional(),
    isStation: z.boolean().optional(),
    linkedStationId: z.string().cuid().optional(),
    isDeparture: z.boolean().optional(),
    isArrival: z.boolean().optional(),
    distanceKm: z.number().nonnegative().optional(),
    roadType: z.enum(ROAD_TYPE_INPUTS).optional(),
    asphaltKm: z.number().nonnegative().optional(),
    gravelKm: z.number().nonnegative().optional(),
  })
  .partial();

export type TerminalInput = z.infer<typeof terminalInputSchema>;
export type CreateTerminalInput = z.infer<typeof createTerminalSchema>;
