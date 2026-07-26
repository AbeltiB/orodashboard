// src/lib/sms.ts
// Thin wrapper around the shared SMS provider — used for OTP codes (see
// src/lib/otp.ts) and for anything else that needs to text a phone number
// (e.g. sending a Telegram recipient their one-time linking link).
const SMS_API_URL = process.env.SMS_API_URL || "https://bstechsms.vercel.app/api/sms";

export async function sendSms(phone: string, message: string): Promise<void> {
  const response = await fetch(SMS_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ to: phone, message }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`SMS send failed (${response.status}): ${detail}`);
  }
}
