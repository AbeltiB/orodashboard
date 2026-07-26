-- CreateEnum
CREATE TYPE "TelegramFrequency" AS ENUM ('DAILY', 'EVERY_N_DAYS', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY');

-- AlterTable
ALTER TABLE "telegram_schedules" ADD COLUMN     "anchorDate" DATE,
ADD COLUMN     "dayOfMonth" INTEGER,
ADD COLUMN     "frequency" "TelegramFrequency" NOT NULL DEFAULT 'DAILY',
ADD COLUMN     "intervalDays" INTEGER,
ADD COLUMN     "monthOfYear" INTEGER,
ADD COLUMN     "weekday" INTEGER;
