-- CreateEnum
CREATE TYPE "TelegramReportType" AS ENUM ('DAILY_SALES_SUMMARY', 'DAILY_DEPOSITS_SUMMARY', 'CUSTOM');

-- CreateEnum
CREATE TYPE "TelegramReportFor" AS ENUM ('TODAY', 'YESTERDAY');

-- CreateEnum
CREATE TYPE "TelegramMessageStatus" AS ENUM ('SENT', 'FAILED');

-- CreateTable
CREATE TABLE "telegram_recipients" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "phone" TEXT,
    "linkToken" TEXT NOT NULL,
    "telegramChatId" TEXT,
    "telegramUsername" TEXT,
    "telegramFirstName" TEXT,
    "linkedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "telegram_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telegram_schedules" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "reportType" "TelegramReportType" NOT NULL,
    "reportFor" "TelegramReportFor" NOT NULL DEFAULT 'YESTERDAY',
    "messageTemplate" TEXT,
    "sendHour" INTEGER NOT NULL,
    "sendMinute" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastRunDate" DATE,
    "lastRunStatus" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "telegram_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telegram_schedule_recipients" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,

    CONSTRAINT "telegram_schedule_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telegram_message_logs" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT,
    "recipientId" TEXT NOT NULL,
    "reportType" "TelegramReportType" NOT NULL,
    "content" TEXT NOT NULL,
    "status" "TelegramMessageStatus" NOT NULL,
    "errorMessage" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telegram_message_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "telegram_recipients_linkToken_key" ON "telegram_recipients"("linkToken");

-- CreateIndex
CREATE UNIQUE INDEX "telegram_recipients_telegramChatId_key" ON "telegram_recipients"("telegramChatId");

-- CreateIndex
CREATE INDEX "telegram_recipients_isActive_idx" ON "telegram_recipients"("isActive");

-- CreateIndex
CREATE INDEX "telegram_schedules_isActive_idx" ON "telegram_schedules"("isActive");

-- CreateIndex
CREATE INDEX "telegram_schedule_recipients_recipientId_idx" ON "telegram_schedule_recipients"("recipientId");

-- CreateIndex
CREATE UNIQUE INDEX "telegram_schedule_recipients_scheduleId_recipientId_key" ON "telegram_schedule_recipients"("scheduleId", "recipientId");

-- CreateIndex
CREATE INDEX "telegram_message_logs_recipientId_idx" ON "telegram_message_logs"("recipientId");

-- CreateIndex
CREATE INDEX "telegram_message_logs_scheduleId_idx" ON "telegram_message_logs"("scheduleId");

-- CreateIndex
CREATE INDEX "telegram_message_logs_sentAt_idx" ON "telegram_message_logs"("sentAt");

-- AddForeignKey
ALTER TABLE "telegram_schedule_recipients" ADD CONSTRAINT "telegram_schedule_recipients_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "telegram_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telegram_schedule_recipients" ADD CONSTRAINT "telegram_schedule_recipients_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "telegram_recipients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telegram_message_logs" ADD CONSTRAINT "telegram_message_logs_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "telegram_schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telegram_message_logs" ADD CONSTRAINT "telegram_message_logs_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "telegram_recipients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
