-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Region" AS ENUM ('ADDIS_ABABA', 'OROMIA', 'AMHARA', 'TIGRAY', 'SNNPR', 'AFAR', 'SOMALI', 'BENISHANGUL_GUMUZ', 'GAMBELA', 'HARARI', 'DIRE_DAWA', 'SIDAMA');

-- CreateEnum
CREATE TYPE "RoadType" AS ENUM ('ASPHALT', 'GRAVEL', 'MIXED');

-- CreateEnum
CREATE TYPE "EmployeeRole" AS ENUM ('SUPERVISOR', 'TICKETER', 'CASHIER');

-- CreateEnum
CREATE TYPE "Sex" AS ENUM ('MALE', 'FEMALE');

-- CreateEnum
CREATE TYPE "PosStatus" AS ENUM ('ACTIVE', 'IDLE', 'MAINTENANCE', 'DECOMMISSIONED');

-- CreateEnum
CREATE TYPE "DeliveryMethod" AS ENUM ('BANK_TRANSFER', 'CHEQUE', 'TELEBIRR', 'OTHER');

-- CreateEnum
CREATE TYPE "BusType" AS ENUM ('BUS', 'MIDBUS', 'MINIBUS');

-- CreateEnum
CREATE TYPE "BusLevel" AS ENUM ('LEVEL_1', 'LEVEL_2', 'LEVEL_3');

-- CreateTable
CREATE TABLE "stations" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "region" "Region" NOT NULL,
    "zone" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "terminals" (
    "id" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isLinkedStation" BOOLEAN NOT NULL DEFAULT false,
    "linkedStationId" TEXT,
    "isDeparture" BOOLEAN NOT NULL DEFAULT false,
    "isArrival" BOOLEAN NOT NULL DEFAULT true,
    "distanceKm" DECIMAL(8,2) NOT NULL,
    "roadType" "RoadType" NOT NULL,
    "asphaltKm" DECIMAL(8,2),
    "gravelKm" DECIMAL(8,2),
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "terminals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "middleName" TEXT,
    "lastName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "posPassword" TEXT,
    "fan" CHAR(16),
    "stationId" TEXT,
    "basicSalary" DECIMAL(10,2) NOT NULL,
    "role" "EmployeeRole" NOT NULL,
    "accountNumber" TEXT,
    "employmentDate" DATE,
    "sex" "Sex" NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "petty_cash" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "date" DATE NOT NULL,
    "method" "DeliveryMethod" NOT NULL,
    "reference" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "petty_cash_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_machines" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "make" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "serial" TEXT NOT NULL,
    "status" "PosStatus" NOT NULL DEFAULT 'ACTIVE',
    "appVersion" TEXT NOT NULL,
    "remark" TEXT,
    "stationId" TEXT,
    "employeeId" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pos_machines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_machine_history" (
    "id" TEXT NOT NULL,
    "posMachineId" TEXT NOT NULL,
    "employeeId" TEXT,
    "employeeName" TEXT,
    "stationId" TEXT,
    "stationName" TEXT,
    "fromDate" DATE NOT NULL,
    "toDate" DATE,
    "remark" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pos_machine_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fare_matrix" (
    "id" TEXT NOT NULL,
    "busType" "BusType" NOT NULL,
    "busLevel" "BusLevel" NOT NULL,
    "asphaltRate" DECIMAL(8,4) NOT NULL,
    "gravelRate" DECIMAL(8,4) NOT NULL,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fare_matrix_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_config" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_config_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "admin_users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "pin" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stations_code_key" ON "stations"("code");

-- CreateIndex
CREATE INDEX "stations_isDeleted_idx" ON "stations"("isDeleted");

-- CreateIndex
CREATE INDEX "stations_region_idx" ON "stations"("region");

-- CreateIndex
CREATE INDEX "terminals_stationId_isDeleted_idx" ON "terminals"("stationId", "isDeleted");

-- CreateIndex
CREATE INDEX "terminals_linkedStationId_idx" ON "terminals"("linkedStationId");

-- CreateIndex
CREATE UNIQUE INDEX "employees_code_key" ON "employees"("code");

-- CreateIndex
CREATE UNIQUE INDEX "employees_phone_key" ON "employees"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "employees_email_key" ON "employees"("email");

-- CreateIndex
CREATE UNIQUE INDEX "employees_fan_key" ON "employees"("fan");

-- CreateIndex
CREATE INDEX "employees_stationId_isDeleted_idx" ON "employees"("stationId", "isDeleted");

-- CreateIndex
CREATE INDEX "employees_role_idx" ON "employees"("role");

-- CreateIndex
CREATE INDEX "employees_isDeleted_idx" ON "employees"("isDeleted");

-- CreateIndex
CREATE INDEX "petty_cash_employeeId_idx" ON "petty_cash"("employeeId");

-- CreateIndex
CREATE INDEX "petty_cash_date_idx" ON "petty_cash"("date");

-- CreateIndex
CREATE UNIQUE INDEX "pos_machines_code_key" ON "pos_machines"("code");

-- CreateIndex
CREATE UNIQUE INDEX "pos_machines_serial_key" ON "pos_machines"("serial");

-- CreateIndex
CREATE INDEX "pos_machines_stationId_idx" ON "pos_machines"("stationId");

-- CreateIndex
CREATE INDEX "pos_machines_employeeId_idx" ON "pos_machines"("employeeId");

-- CreateIndex
CREATE INDEX "pos_machines_status_isDeleted_idx" ON "pos_machines"("status", "isDeleted");

-- CreateIndex
CREATE INDEX "pos_machine_history_posMachineId_idx" ON "pos_machine_history"("posMachineId");

-- CreateIndex
CREATE INDEX "pos_machine_history_employeeId_idx" ON "pos_machine_history"("employeeId");

-- CreateIndex
CREATE INDEX "pos_machine_history_toDate_idx" ON "pos_machine_history"("toDate");

-- CreateIndex
CREATE INDEX "fare_matrix_busType_idx" ON "fare_matrix"("busType");

-- CreateIndex
CREATE UNIQUE INDEX "fare_matrix_busType_busLevel_key" ON "fare_matrix"("busType", "busLevel");

-- CreateIndex
CREATE UNIQUE INDEX "admin_users_phone_key" ON "admin_users"("phone");

-- AddForeignKey
ALTER TABLE "terminals" ADD CONSTRAINT "terminals_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "stations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "terminals" ADD CONSTRAINT "terminals_linkedStationId_fkey" FOREIGN KEY ("linkedStationId") REFERENCES "stations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "stations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "petty_cash" ADD CONSTRAINT "petty_cash_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_machines" ADD CONSTRAINT "pos_machines_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "stations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_machines" ADD CONSTRAINT "pos_machines_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_machine_history" ADD CONSTRAINT "pos_machine_history_posMachineId_fkey" FOREIGN KEY ("posMachineId") REFERENCES "pos_machines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_machine_history" ADD CONSTRAINT "pos_machine_history_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_machine_history" ADD CONSTRAINT "pos_machine_history_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "stations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

