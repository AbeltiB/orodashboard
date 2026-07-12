-- CreateEnum
CREATE TYPE "PosAssignmentMode" AS ENUM ('EXCLUSIVE', 'SHARED');

-- AlterTable
ALTER TABLE "pos_machines" ADD COLUMN     "assignmentMode" "PosAssignmentMode" NOT NULL DEFAULT 'EXCLUSIVE';

-- CreateTable
CREATE TABLE "pos_sessions" (
    "id" TEXT NOT NULL,
    "posMachineId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "employeeName" TEXT NOT NULL,
    "stationId" TEXT,
    "stationName" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "note" TEXT,
    "loggedBy" TEXT,

    CONSTRAINT "pos_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pos_sessions_posMachineId_endedAt_idx" ON "pos_sessions"("posMachineId", "endedAt");

-- CreateIndex
CREATE INDEX "pos_sessions_employeeId_idx" ON "pos_sessions"("employeeId");

-- CreateIndex
CREATE INDEX "pos_sessions_stationId_idx" ON "pos_sessions"("stationId");

-- AddForeignKey
ALTER TABLE "pos_sessions" ADD CONSTRAINT "pos_sessions_posMachineId_fkey" FOREIGN KEY ("posMachineId") REFERENCES "pos_machines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_sessions" ADD CONSTRAINT "pos_sessions_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_sessions" ADD CONSTRAINT "pos_sessions_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "stations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

