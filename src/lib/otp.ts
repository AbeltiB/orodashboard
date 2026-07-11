// src/lib/otp.ts
import crypto from "crypto";

export const OTP_EXPIRY_MINUTES = 5;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_LOCKOUT_MINUTES = 15;
export const OTP_RESEND_COOLDOWN_SECONDS = 30;

export function generateOtpCode(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

export interface OtpSender {
  send(phone: string, code: string): Promise<void>;
}

// Dev-only sender — logs the code server-side. Swap `otpSender` for a real
// SMS provider implementation later; nothing else in the auth flow changes.
class DevLogOtpSender implements OtpSender {
  async send(phone: string, code: string): Promise<void> {
    console.log(`\n📱 [DEV OTP] ${phone} -> ${code} (expires in ${OTP_EXPIRY_MINUTES}m)\n`);
  }
}

export const otpSender: OtpSender = new DevLogOtpSender();
