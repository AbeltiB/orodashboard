// src/lib/schemas/cashier.ts
import { z } from "zod";

const phoneSchema = z.string().regex(/^\+251[79]\d{8}$/, "Phone must be in +251XXXXXXXXX format");
const pinSchema = z.string().regex(/^\d{4}$/, "PIN must be exactly 4 digits");

export const cashierLoginSchema = z.object({
  phone: phoneSchema,
  pin: pinSchema,
});

export const cashierChangePinSchema = z.object({
  currentPin: pinSchema,
  newPin: pinSchema,
});

// Admin-side: set/reset a cashier's PIN (doesn't require knowing the old one).
export const cashierResetPinSchema = z.object({
  pin: pinSchema,
});

export const assignCashierTerminalSchema = z.object({
  employeeId: z.string().cuid(),
  terminalId: z.string().cuid(),
});

export const assignCashierStationSchema = z.object({
  employeeId: z.string().cuid(),
  stationId: z.string().cuid(),
});

export type CashierLoginInput = z.infer<typeof cashierLoginSchema>;
export type CashierChangePinInput = z.infer<typeof cashierChangePinSchema>;
export type CashierResetPinInput = z.infer<typeof cashierResetPinSchema>;
export type AssignCashierTerminalInput = z.infer<typeof assignCashierTerminalSchema>;
export type AssignCashierStationInput = z.infer<typeof assignCashierStationSchema>;
