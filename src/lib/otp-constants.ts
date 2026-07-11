// src/lib/otp-constants.ts
// Split out from src/lib/otp.ts so client components (e.g. the Security
// settings display) can import these numbers without pulling in Node's
// `crypto` module, which otp.ts needs for real code generation/hashing.

export const OTP_EXPIRY_MINUTES = 5;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_LOCKOUT_MINUTES = 15;
export const OTP_RESEND_COOLDOWN_SECONDS = 30;
