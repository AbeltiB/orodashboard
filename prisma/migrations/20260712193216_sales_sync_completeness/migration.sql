-- AlterEnum
ALTER TYPE "SyncStatus" ADD VALUE 'SKIPPED';

-- AlterTable
ALTER TABLE "sales_sync_logs" ADD COLUMN     "ourTotal" INTEGER,
ADD COLUMN     "sourceTotal" INTEGER;

