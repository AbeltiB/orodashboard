-- AlterTable
ALTER TABLE "sales_trips" ADD COLUMN     "totalServiceCharge" DECIMAL(12,2);

-- Backfill: the source reports serviceCharge as a per-passenger rate, so
-- the actual amount collected on each trip is serviceCharge * passengers.
UPDATE "sales_trips" SET "totalServiceCharge" = "serviceCharge" * "passengers";

-- AlterTable
ALTER TABLE "sales_trips" ALTER COLUMN "totalServiceCharge" SET NOT NULL;
