// src/lib/schemas/settings.ts
import { z } from "zod";
import { ADMIN_ROLE_VALUES, permissionsSchema } from "@/lib/permissions";

export const upsertSystemConfigSchema = z.object({
  key: z.string().min(1).max(100).regex(/^[a-z0-9_]+$/, "Key must be snake_case"),
  value: z.string().min(1).max(2000),
  description: z.string().max(500).optional(),
});

export const bulkUpsertSystemConfigSchema = z.object({
  configs: z.array(upsertSystemConfigSchema).min(1),
});

const phoneSchema = z
  .string()
  .regex(/^\+251[79]\d{8}$/, "Phone must be in +251XXXXXXXXX format");

export const createAdminUserSchema = z.object({
  firstName: z.string().min(1).max(100),
  middleName: z.string().max(100).optional(),
  lastName: z.string().min(1).max(100),
  phone: phoneSchema,
  companyEmail: z.string().email().max(200).optional(),
  personalEmail: z.string().email().max(200).optional(),
  role: z.enum(ADMIN_ROLE_VALUES),
  // If omitted, the API fills in sensible role-based defaults.
  permissions: permissionsSchema.optional(),
});

export const updateAdminUserSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  middleName: z.string().max(100).nullable().optional(),
  lastName: z.string().min(1).max(100).optional(),
  phone: phoneSchema.optional(),
  companyEmail: z.string().email().max(200).nullable().optional(),
  personalEmail: z.string().email().max(200).nullable().optional(),
  role: z.enum(ADMIN_ROLE_VALUES).optional(),
  permissions: permissionsSchema.optional(),
  isActive: z.boolean().optional(),
});

export type UpsertSystemConfigInput = z.infer<typeof upsertSystemConfigSchema>;
export type CreateAdminUserInput = z.infer<typeof createAdminUserSchema>;
export type UpdateAdminUserInput = z.infer<typeof updateAdminUserSchema>;