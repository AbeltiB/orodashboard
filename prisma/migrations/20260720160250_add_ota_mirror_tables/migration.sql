-- CreateEnum
CREATE TYPE "OtaSyncEntity" AS ENUM ('EMPLOYEES', 'TERMINALS', 'VEHICLES');

-- CreateTable
CREATE TABLE "ota_sync_logs" (
    "id" TEXT NOT NULL,
    "entity" "OtaSyncEntity" NOT NULL,
    "source" "SyncSource" NOT NULL,
    "triggeredBy" TEXT,
    "status" "SyncStatus" NOT NULL DEFAULT 'SUCCESS',
    "pagesFetched" INTEGER NOT NULL DEFAULT 0,
    "rowsFetched" INTEGER NOT NULL DEFAULT 0,
    "rowsCreated" INTEGER NOT NULL DEFAULT 0,
    "rowsUpdated" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "sourceTotal" INTEGER,
    "ourTotal" INTEGER,
    "rateLimitedUntil" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "ota_sync_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ota_employees" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "position" TEXT,
    "department" TEXT,
    "employeeIdExternal" TEXT,
    "joiningDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "roleName" TEXT,
    "roleLabel" TEXT,
    "userStatus" TEXT,
    "terminalId" TEXT,
    "terminalName" TEXT,
    "raw" JSONB NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ota_employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ota_terminals" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "status" TEXT,
    "zoneName" TEXT,
    "woredaName" TEXT,
    "cityName" TEXT,
    "companyNames" TEXT,
    "raw" JSONB NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ota_terminals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ota_vehicles" (
    "id" TEXT NOT NULL,
    "plateNumber" TEXT,
    "plateRegion" TEXT,
    "seatCapacity" INTEGER,
    "status" TEXT,
    "isAssignedToRoute" BOOLEAN,
    "driverName" TEXT,
    "driverLicenceNumber" TEXT,
    "fleetTypeName" TEXT,
    "associationName" TEXT,
    "assignedTerminalId" TEXT,
    "assignedTerminalName" TEXT,
    "vehicleLevelName" TEXT,
    "raw" JSONB NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ota_vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ota_sync_logs_entity_startedAt_idx" ON "ota_sync_logs"("entity", "startedAt");

-- CreateIndex
CREATE INDEX "ota_employees_isActive_idx" ON "ota_employees"("isActive");

-- CreateIndex
CREATE INDEX "ota_employees_companyId_idx" ON "ota_employees"("companyId");

-- CreateIndex
CREATE INDEX "ota_terminals_status_idx" ON "ota_terminals"("status");

-- CreateIndex
CREATE INDEX "ota_terminals_name_idx" ON "ota_terminals"("name");

-- CreateIndex
CREATE INDEX "ota_vehicles_status_idx" ON "ota_vehicles"("status");

-- CreateIndex
CREATE INDEX "ota_vehicles_assignedTerminalId_idx" ON "ota_vehicles"("assignedTerminalId");

-- CreateIndex
CREATE INDEX "ota_vehicles_plateNumber_idx" ON "ota_vehicles"("plateNumber");
