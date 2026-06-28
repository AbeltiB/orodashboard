// src/lib/schemas/settings.ts
import { z } from "zod";

export const upsertSystemConfigSchema = z.object({
  key: z.string().min(1).max(100).regex(/^[a-z0-9_]+$/, "Key must be snake_case"),
  value: z.string().min(1).max(2000),
  description: z.string().max(500).optional(),
});

export const bulkUpsertSystemConfigSchema = z.object({
  configs: z.array(upsertSystemConfigSchema).min(1),
});

export const createAdminUserSchema = z.object({
  name: z.string().min(1).max(100),
  phone: z
    .string()
    .regex(/^\+251[79]\d{8}$/, "Phone must be in +251XXXXXXXXX format"),
  pin: z.string().regex(/^\d{6}$/, "PIN must be exactly 6 digits"),
});

export const updateAdminUserSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  phone: z
    .string()
    .regex(/^\+251[79]\d{8}$/)
    .optional(),
  pin: z.string().regex(/^\d{6}$/).optional(),
  isActive: z.boolean().optional(),
});

export type UpsertSystemConfigInput = z.infer<typeof upsertSystemConfigSchema>;
export type CreateAdminUserInput = z.infer<typeof createAdminUserSchema>;
export type UpdateAdminUserInput = z.infer<typeof updateAdminUserSchema>;