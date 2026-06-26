import { prisma } from "./prisma";

export async function connectDatabase() {
  try {
    await prisma.$connect();

    console.log(`
===================================
✅ DATABASE CONNECTED SUCCESSFULLY
===================================
Provider : PostgreSQL
Database : Supabase
Environment : ${process.env.NODE_ENV}
===================================
`);
  } catch (error) {
    console.error(`
===================================
❌ DATABASE CONNECTION FAILED
===================================
Reason:
`, error);

    process.exit(1);
  }
}