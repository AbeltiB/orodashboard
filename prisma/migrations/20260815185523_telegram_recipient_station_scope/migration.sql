-- AlterTable
ALTER TABLE "telegram_recipients" ADD COLUMN     "stationId" TEXT;

-- CreateIndex
CREATE INDEX "telegram_recipients_stationId_idx" ON "telegram_recipients"("stationId");

-- AddForeignKey
ALTER TABLE "telegram_recipients" ADD CONSTRAINT "telegram_recipients_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "stations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
