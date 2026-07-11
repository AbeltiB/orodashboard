// src/lib/schemas/auth.ts
import { z } from "zod";

const phoneSchema = z
  .string()
  .regex(/^\+251[79]\d{8}$/, "Phone must be in +251XXXXXXXXX format");

export const sendOtpSchema = z.object({
  phone: phoneSchema,
});

export const verifyOtpSchema = z.object({
  phone: phoneSchema,
  otp: z.string().regex(/^\d{6}$/, "OTP must be exactly 6 digits"),
});

export type SendOtpInput = z.infer<typeof sendOtpSchema>;
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;
