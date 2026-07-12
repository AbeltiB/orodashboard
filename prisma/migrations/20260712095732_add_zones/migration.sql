-- CreateTable: zones (before touching stations, so we can backfill into it)
CREATE TABLE "zones" (
    "id" TEXT NOT NULL,
    "region" "Region" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "zones_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "zones_isDeleted_idx" ON "zones"("isDeleted");
CREATE UNIQUE INDEX "zones_region_name_key" ON "zones"("region", "name");

-- Add stations.zoneId as nullable first (zone string column stays for now)
ALTER TABLE "stations" ADD COLUMN "zoneId" TEXT;

-- Backfill: one Zone row per distinct (region, zone) pair currently in use
INSERT INTO "zones" ("id", "region", "name", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, "region", "zone", now(), now()
FROM (SELECT DISTINCT "region", "zone" FROM "stations" WHERE "zone" IS NOT NULL) AS distinct_zones;

-- Point every station at its newly-created Zone
UPDATE "stations" s
SET "zoneId" = z."id"
FROM "zones" z
WHERE s."region" = z."region" AND s."zone" = z."name";

-- Now safe to drop the old free-text column
ALTER TABLE "stations" DROP COLUMN "zone";

CREATE INDEX "stations_zoneId_idx" ON "stations"("zoneId");
ALTER TABLE "stations" ADD CONSTRAINT "stations_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: zone_supervisors
CREATE TABLE "zone_supervisors" (
    "id" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "zone_supervisors_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "zone_supervisors_employeeId_idx" ON "zone_supervisors"("employeeId");
CREATE UNIQUE INDEX "zone_supervisors_zoneId_employeeId_key" ON "zone_supervisors"("zoneId", "employeeId");

ALTER TABLE "zone_supervisors" ADD CONSTRAINT "zone_supervisors_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "zones"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "zone_supervisors" ADD CONSTRAINT "zone_supervisors_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
