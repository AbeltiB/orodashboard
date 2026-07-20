// src/lib/schemas/ota.ts
import { z } from "zod";

// Mirrors the required fields OTA's own /api/company-users create endpoint
// validates for (confirmed live via its validation error messages):
// role_name/role_id, full_name, email, position, department. Phone,
// employee_id and joining_date are accepted but not required by OTA.
export const createOtaEmployeeSchema = z.object({
  fullName: z.string().min(1).max(150),
  email: z.email(),
  phone: z.string().max(30).optional().or(z.literal("")),
  position: z.string().min(1).max(100),
  department: z.string().min(1).max(100),
  roleName: z.string().min(1).max(100),
  employeeId: z.string().max(50).optional().or(z.literal("")),
  joiningDate: z.string().date().optional().or(z.literal("")), // "YYYY-MM-DD"
});

export type CreateOtaEmployeeInput = z.infer<typeof createOtaEmployeeSchema>;
