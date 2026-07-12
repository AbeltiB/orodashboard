-- CreateEnum
CREATE TYPE "SyncSource" AS ENUM ('MANUAL', 'AUTO');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('SUCCESS', 'FAILED', 'PARTIAL');

-- CreateTable
CREATE TABLE "sales_trips" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "distanceKm" DECIMAL(10,2) NOT NULL,
    "tariff" DECIMAL(10,2) NOT NULL,
    "serviceCharge" DECIMAL(10,2) NOT NULL,
    "passengers" INTEGER NOT NULL,
    "level" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "departureTerminalName" TEXT NOT NULL,
    "arrivalTerminalName" TEXT NOT NULL,
    "employeeExternalId" TEXT,
    "employeeName" TEXT,
    "employeeEmail" TEXT,
    "vehicleExternalId" TEXT,
    "vehiclePlateNo" TEXT,
    "vehiclePlateCode" TEXT,
    "vehicleFleetCategory" TEXT,
    "vehicleAssociation" TEXT,
    "vehicleLevel" TEXT,
    "lastSyncId" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_trips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_sync_logs" (
    "id" TEXT NOT NULL,
    "source" "SyncSource" NOT NULL,
    "triggeredBy" TEXT,
    "windowFrom" TIMESTAMP(3),
    "windowTo" TIMESTAMP(3) NOT NULL,
    "status" "SyncStatus" NOT NULL DEFAULT 'SUCCESS',
    "pagesFetched" INTEGER NOT NULL DEFAULT 0,
    "rowsFetched" INTEGER NOT NULL DEFAULT 0,
    "rowsCreated" INTEGER NOT NULL DEFAULT 0,
    "rowsUpdated" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "sales_sync_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sales_trips_date_idx" ON "sales_trips"("date");

-- CreateIndex
CREATE INDEX "sales_trips_departureTerminalName_idx" ON "sales_trips"("departureTerminalName");

-- CreateIndex
CREATE INDEX "sales_trips_arrivalTerminalName_idx" ON "sales_trips"("arrivalTerminalName");

-- CreateIndex
CREATE INDEX "sales_trips_employeeExternalId_idx" ON "sales_trips"("employeeExternalId");

-- CreateIndex
CREATE INDEX "sales_trips_vehicleExternalId_idx" ON "sales_trips"("vehicleExternalId");

-- CreateIndex
CREATE INDEX "sales_trips_lastSyncId_idx" ON "sales_trips"("lastSyncId");

-- CreateIndex
CREATE INDEX "sales_sync_logs_source_idx" ON "sales_sync_logs"("source");

-- CreateIndex
CREATE INDEX "sales_sync_logs_startedAt_idx" ON "sales_sync_logs"("startedAt");

-- AddForeignKey
ALTER TABLE "sales_trips" ADD CONSTRAINT "sales_trips_lastSyncId_fkey" FOREIGN KEY ("lastSyncId") REFERENCES "sales_sync_logs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

