// src/lib/schemas/ota.ts
import { z } from "zod";

// OTA's own /api/company-users create endpoint validates different fields
// required depending on role_name (confirmed live): office roles like
// company_staff require position+department; the company tickter role
// doesn't, needing Terminal + Fayda ID instead. This schema only enforces
// what's true for every role (full_name, email, role_name) — the rest are
// optional here and OTA's own error message is surfaced if a role-specific
// field turns out to be missing.
export const createOtaEmployeeSchema = z.object({
  fullName: z.string().min(1).max(150),
  email: z.email(),
  phone: z.string().max(30).optional().or(z.literal("")),
  roleName: z.string().min(1).max(100),
  position: z.string().max(100).optional().or(z.literal("")),
  department: z.string().max(100).optional().or(z.literal("")),
  fayidaId: z.string().max(30).optional().or(z.literal("")),
  terminalId: z.string().optional().or(z.literal("")),
  isActive: z.boolean().optional(),
  employeeId: z.string().max(50).optional().or(z.literal("")),
  joiningDate: z.string().date().optional().or(z.literal("")), // "YYYY-MM-DD"
});

export type CreateOtaEmployeeInput = z.infer<typeof createOtaEmployeeSchema>;
