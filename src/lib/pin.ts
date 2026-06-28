// src/lib/pin.ts
/**
 * PIN hashing using bcrypt (via the `bcryptjs` pure-JS package — no native
 * bindings required, works in Edge Runtime and serverless).
 *
 * Install: npm install bcryptjs @types/bcryptjs
 */
import bcrypt from "bcryptjs";

const SALT_ROUNDS = 10;

export async function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, SALT_ROUNDS);
}

export async function verifyPin(pin: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pin, hash);
}