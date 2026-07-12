-- AlterEnum
ALTER TYPE "SyncStatus" ADD VALUE 'RATE_LIMITED';

-- AlterTable
ALTER TABLE "sales_sync_logs" ADD COLUMN     "rateLimitedUntil" TIMESTAMP(3);

