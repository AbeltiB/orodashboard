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

export const loginStartSchema = z.object({
  phone: phoneSchema,
});

export const verifyPinSchema = z.object({
  phone: phoneSchema,
  pin: z.string().regex(/^\d{4}$/, "PIN must be exactly 4 digits"),
});

export const setPinSchema = z.object({
  pin: z.string().regex(/^\d{4}$/, "PIN must be exactly 4 digits"),
});

export type SendOtpInput = z.infer<typeof sendOtpSchema>;
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;
export type LoginStartInput = z.infer<typeof loginStartSchema>;
export type VerifyPinInput = z.infer<typeof verifyPinSchema>;
export type SetPinInput = z.infer<typeof setPinSchema>;
