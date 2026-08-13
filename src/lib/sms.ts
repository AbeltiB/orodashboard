// src/lib/sms.ts
// Direct integration with AfroMessage (https://afromessage.com) — used for
// OTP codes (see src/lib/otp.ts) and anything else that needs to text a
// phone number (e.g. a Telegram recipient's one-time linking link). Mirrors
// the working implementation in the sibling BS_Technologies/sms project
// (src/lib/afromessage.ts) rather than guessing the contract.
const REQUEST_TIMEOUT_MS = 10_000;

type AfroMessageApiResponse = {
  acknowledge: "success" | "error";
  response?: { message_id?: string; message?: string; errors?: unknown };
  message?: string;
};

function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

// AfroMessage expects the bare 251XXXXXXXXX form, no leading "+" — every
// caller in this app works with "+251XXXXXXXXX" (see phoneSchema across the
// codebase), so the conversion happens here rather than pushing it onto
// every call site.
function toAfroMessageFormat(phone: string): string {
  return phone.startsWith("+") ? phone.slice(1) : phone;
}

export async function sendSms(phone: string, message: string): Promise<void> {
  const url = getEnv("OTP_URL");
  const from = getEnv("OTP_FROM");
  const sender = getEnv("OTP_SENDER");
  const token = getEnv("OTP_TOKEN");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ to: toAfroMessageFormat(phone), message, from, sender }),
      signal: controller.signal,
    });

    const body = (await res.json().catch(() => null)) as AfroMessageApiResponse | null;

    if (!res.ok || !body || body.acknowledge !== "success") {
      const detail = body?.response?.message ?? body?.message ?? `HTTP ${res.status}`;
      throw new Error(`SMS send failed: ${detail}`);
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("SMS send failed: upstream request timed out");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
