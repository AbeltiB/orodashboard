/*
  Warnings:

  - You are about to drop the column `name` on the `admin_users` table. All the data in the column will be lost.
  - You are about to drop the column `pin` on the `admin_users` table. All the data in the column will be lost.
  - Added the required column `firstName` to the `admin_users` table without a default value. This is not possible if the table is not empty.
  - Added the required column `lastName` to the `admin_users` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'VIEWER');

-- AlterTable
ALTER TABLE "admin_users" DROP COLUMN "name",
DROP COLUMN "pin",
ADD COLUMN     "companyEmail" TEXT,
ADD COLUMN     "firstName" TEXT NOT NULL,
ADD COLUMN     "lastLoginAt" TIMESTAMP(3),
ADD COLUMN     "lastName" TEXT NOT NULL,
ADD COLUMN     "lockedUntil" TIMESTAMP(3),
ADD COLUMN     "middleName" TEXT,
ADD COLUMN     "otpAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "otpCodeHash" TEXT,
ADD COLUMN     "otpExpiresAt" TIMESTAMP(3),
ADD COLUMN     "otpRequestedAt" TIMESTAMP(3),
ADD COLUMN     "permissions" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "personalEmail" TEXT,
ADD COLUMN     "role" "AdminRole" NOT NULL DEFAULT 'ADMIN';

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sessions_tokenHash_key" ON "sessions"("tokenHash");

-- CreateIndex
CREATE INDEX "sessions_adminUserId_idx" ON "sessions"("adminUserId");

-- CreateIndex
CREATE INDEX "sessions_expiresAt_idx" ON "sessions"("expiresAt");

-- CreateIndex
CREATE INDEX "admin_users_role_idx" ON "admin_users"("role");

-- CreateIndex
CREATE INDEX "admin_users_isActive_idx" ON "admin_users"("isActive");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
