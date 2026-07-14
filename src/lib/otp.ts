// src/lib/otp.ts
import crypto from "crypto";

export { OTP_EXPIRY_MINUTES, OTP_MAX_ATTEMPTS, OTP_LOCKOUT_MINUTES, OTP_RESEND_COOLDOWN_SECONDS } from "./otp-constants";
import { OTP_EXPIRY_MINUTES } from "./otp-constants";

export function generateOtpCode(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

export interface OtpSender {
  send(phone: string, code: string): Promise<void>;
}

const SMS_API_URL = process.env.SMS_API_URL || "https://bstechsms.vercel.app/api/sms";

class BsTechSmsOtpSender implements OtpSender {
  async send(phone: string, code: string): Promise<void> {
    const message = `Your OTP code for the OroDashboard system is ${code}. It is valid for ${OTP_EXPIRY_MINUTES} minutes.`;

    const response = await fetch(SMS_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: phone, message }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`SMS send failed (${response.status}): ${detail}`);
    }

    console.log(`\n📱 [OTP SENT] ${phone} (expires in ${OTP_EXPIRY_MINUTES}m)\n`);
  }
}

export const otpSender: OtpSender = new BsTechSmsOtpSender();
