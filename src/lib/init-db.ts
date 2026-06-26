import "server-only";

import { connectDatabase } from "./db";

let initialized = false;

export async function initializeDatabase() {
  if (initialized) return;

  initialized = true;

  await connectDatabase();
}