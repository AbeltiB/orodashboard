// src/lib/schemas/fare-matrix.ts
import { z } from "zod";
import { BUS_TYPE_VALUES, BUS_LEVEL_VALUES } from "@/lib/api-utils";

export const upsertFareMatrixRowSchema = z.object({
  busType: z.enum(BUS_TYPE_VALUES),
  busLevel: z.enum(BUS_LEVEL_VALUES),
  asphaltRate: z.number().positive(),
  gravelRate: z.number().positive(),
});

// Bulk upsert — all 9 rows at once (the UI sends the full matrix)
export const bulkUpsertFareMatrixSchema = z.object({
  rows: z.array(upsertFareMatrixRowSchema).min(1).max(9),
});

export type UpsertFareMatrixRowInput = z.infer<typeof upsertFareMatrixRowSchema>;
export type BulkUpsertFareMatrixInput = z.infer<typeof bulkUpsertFareMatrixSchema>;