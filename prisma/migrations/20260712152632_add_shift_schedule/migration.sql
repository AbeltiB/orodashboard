-- CreateEnum
CREATE TYPE "ShiftType" AS ENUM ('MORNING', 'AFTERNOON');

-- AlterTable
ALTER TABLE "pos_sessions" ADD COLUMN     "shiftAssignmentId" TEXT;

-- CreateTable
CREATE TABLE "shift_assignments" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "shiftType" "ShiftType" NOT NULL,
    "role" "EmployeeRole" NOT NULL,
    "posMachineId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "externalRef" TEXT,
    "importBatchId" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shift_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shift_import_batches" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "importedBy" TEXT NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "successCount" INTEGER NOT NULL,
    "errorCount" INTEGER NOT NULL,
    "errors" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shift_import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "shift_assignments_stationId_date_idx" ON "shift_assignments"("stationId", "date");

-- CreateIndex
CREATE INDEX "shift_assignments_date_shiftType_idx" ON "shift_assignments"("date", "shiftType");

-- CreateIndex
CREATE INDEX "shift_assignments_posMachineId_idx" ON "shift_assignments"("posMachineId");

-- CreateIndex
CREATE INDEX "shift_assignments_importBatchId_idx" ON "shift_assignments"("importBatchId");

-- CreateIndex
CREATE UNIQUE INDEX "shift_assignments_employeeId_date_shiftType_key" ON "shift_assignments"("employeeId", "date", "shiftType");

-- CreateIndex
CREATE INDEX "pos_sessions_shiftAssignmentId_idx" ON "pos_sessions"("shiftAssignmentId");

-- AddForeignKey
ALTER TABLE "pos_sessions" ADD CONSTRAINT "pos_sessions_shiftAssignmentId_fkey" FOREIGN KEY ("shiftAssignmentId") REFERENCES "shift_assignments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_assignments" ADD CONSTRAINT "shift_assignments_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_assignments" ADD CONSTRAINT "shift_assignments_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "stations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_assignments" ADD CONSTRAINT "shift_assignments_posMachineId_fkey" FOREIGN KEY ("posMachineId") REFERENCES "pos_machines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_assignments" ADD CONSTRAINT "shift_assignments_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "shift_import_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

