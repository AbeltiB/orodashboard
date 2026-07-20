-- AlterTable
ALTER TABLE "ota_vehicles" ADD COLUMN     "arrivalTerminalName" TEXT,
ADD COLUMN     "departureTerminalName" TEXT,
ADD COLUMN     "routeDistanceKm" DECIMAL(8,2);

-- CreateIndex
CREATE INDEX "ota_vehicles_associationName_idx" ON "ota_vehicles"("associationName");

-- CreateIndex
CREATE INDEX "ota_vehicles_departureTerminalName_idx" ON "ota_vehicles"("departureTerminalName");

-- CreateIndex
CREATE INDEX "ota_vehicles_arrivalTerminalName_idx" ON "ota_vehicles"("arrivalTerminalName");
