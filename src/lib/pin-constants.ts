// src/lib/pin-constants.ts
// Split out for the same reason as otp-constants.ts — importable from client
// components without pulling in Node's `crypto`/bcrypt.

export const PIN_LENGTH = 4;
export const PIN_MAX_ATTEMPTS = 5;
export const PIN_LOCKOUT_MINUTES = 15;
