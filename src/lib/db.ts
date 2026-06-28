import { prisma } from "./prisma";

export async function connectDatabase() {
  try {
    // $queryRaw is lighter than $connect — it sends a real query
    // so we know the connection string, network, and credentials all work.
    await prisma.$queryRaw`SELECT 1`;

    console.log(`
===================================
✅ DATABASE CONNECTED SUCCESSFULLY
===================================
  Provider    : PostgreSQL (Supabase)
  Environment : ${process.env.NODE_ENV ?? "unknown"}
===================================
`);
  } catch (error) {
    // Log the full error clearly but DO NOT call process.exit() —
    // that would kill the Next.js dev server on a transient network hiccup.
    // The app will surface proper errors per-request instead.
    console.error(`
===================================
❌ DATABASE CONNECTION FAILED
===================================
  Check that DATABASE_URL in .env is correct and that your
  Supabase project is running and reachable.

  Common causes:
    • DATABASE_URL missing or misspelled in .env
    • Wrong password (regenerate in Supabase → Settings → Database)
    • Supabase project is paused (free tier auto-pauses after inactivity)
    • Network / firewall blocking port 5432

  Error detail:
`, error, `
===================================
`);
  }
}