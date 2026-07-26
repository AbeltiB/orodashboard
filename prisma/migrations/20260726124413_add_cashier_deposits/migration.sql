-- CreateEnum
CREATE TYPE "DepositStatus" AS ENUM ('AWAITING_SUBMISSION', 'SUBMITTED', 'VERIFIED_OK', 'VERIFIED_MISMATCH', 'FAILED', 'RESOLVED');

-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "cashierPinAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "cashierPinHash" TEXT,
ADD COLUMN     "cashierPinLockedUntil" TIMESTAMP(3),
ADD COLUMN     "cashierPinSetAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "cashier_sessions" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "cashier_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cashier_terminal_assignments" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "terminalId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedBy" TEXT,

    CONSTRAINT "cashier_terminal_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deposits" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "terminalId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "expectedAmount" DECIMAL(12,2) NOT NULL,
    "bank" TEXT,
    "referenceNumber" TEXT,
    "accountSuffix" TEXT,
    "phoneNumber" TEXT,
    "status" "DepositStatus" NOT NULL DEFAULT 'AWAITING_SUBMISSION',
    "verifyRequestId" TEXT,
    "verifiedAmount" DECIMAL(12,2),
    "currency" TEXT,
    "senderName" TEXT,
    "receiverName" TEXT,
    "receiverAccount" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "verifyErrorMessage" TEXT,
    "rawVerifyResponse" JSONB,
    "discrepancyAmount" DECIMAL(12,2),
    "discrepancyReason" TEXT,
    "discrepancyResolvedBy" TEXT,
    "discrepancyResolvedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deposits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cashier_sessions_tokenHash_key" ON "cashier_sessions"("tokenHash");

-- CreateIndex
CREATE INDEX "cashier_sessions_employeeId_idx" ON "cashier_sessions"("employeeId");

-- CreateIndex
CREATE INDEX "cashier_sessions_expiresAt_idx" ON "cashier_sessions"("expiresAt");

-- CreateIndex
CREATE INDEX "cashier_terminal_assignments_terminalId_isActive_idx" ON "cashier_terminal_assignments"("terminalId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "cashier_terminal_assignments_employeeId_terminalId_key" ON "cashier_terminal_assignments"("employeeId", "terminalId");

-- CreateIndex
CREATE UNIQUE INDEX "deposits_verifyRequestId_key" ON "deposits"("verifyRequestId");

-- CreateIndex
CREATE INDEX "deposits_terminalId_date_idx" ON "deposits"("terminalId", "date");

-- CreateIndex
CREATE INDEX "deposits_date_idx" ON "deposits"("date");

-- CreateIndex
CREATE INDEX "deposits_status_idx" ON "deposits"("status");

-- CreateIndex
CREATE UNIQUE INDEX "deposits_employeeId_terminalId_date_key" ON "deposits"("employeeId", "terminalId", "date");

-- AddForeignKey
ALTER TABLE "cashier_sessions" ADD CONSTRAINT "cashier_sessions_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cashier_terminal_assignments" ADD CONSTRAINT "cashier_terminal_assignments_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cashier_terminal_assignments" ADD CONSTRAINT "cashier_terminal_assignments_terminalId_fkey" FOREIGN KEY ("terminalId") REFERENCES "terminals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_terminalId_fkey" FOREIGN KEY ("terminalId") REFERENCES "terminals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
