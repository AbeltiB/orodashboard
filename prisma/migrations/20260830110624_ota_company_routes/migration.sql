-- AlterEnum
ALTER TYPE "OtaSyncEntity" ADD VALUE 'COMPANY_ROUTES';

-- CreateTable
CREATE TABLE "ota_company_routes" (
    "id" TEXT NOT NULL,
    "departureTerminalId" TEXT NOT NULL,
    "departureTerminalName" TEXT NOT NULL,
    "arrivalTerminalId" TEXT NOT NULL,
    "arrivalTerminalName" TEXT NOT NULL,
    "distanceKm" DECIMAL(8,2) NOT NULL,
    "roadType" TEXT,
    "raw" JSONB NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ota_company_routes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ota_company_routes_departureTerminalId_idx" ON "ota_company_routes"("departureTerminalId");
