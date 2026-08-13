-- CreateTable
CREATE TABLE "cashier_station_assignments" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedBy" TEXT,

    CONSTRAINT "cashier_station_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cashier_station_assignments_stationId_isActive_idx" ON "cashier_station_assignments"("stationId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "cashier_station_assignments_employeeId_stationId_key" ON "cashier_station_assignments"("employeeId", "stationId");

-- AddForeignKey
ALTER TABLE "cashier_station_assignments" ADD CONSTRAINT "cashier_station_assignments_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cashier_station_assignments" ADD CONSTRAINT "cashier_station_assignments_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "stations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
