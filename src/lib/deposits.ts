// src/lib/deposits.ts
// Core business logic for cashier deposit reconciliation: what a terminal's
// cashier is expected to deposit for a given day (sum of that day's SalesTrip
// departures — see AGENTS.md answer "Sales trips departing that terminal that
// day"), and folding a verify.et result back onto a Deposit row.
import { prisma } from "./prisma";
import { toNumber } from "./api-utils";
import {
  submitVerification,
  fetchVerificationStatus,
  verifyEtConfigFromEnv,
  VerifyEtError,
  type DepositSubmissionInput,
  type VerifyEtResultItem,
  type VerifyEtStatusData,
} from "./verify-et/client";
import type { $Enums, Deposit } from "@/generated/prisma/client";

type DepositWithRelations = Deposit & {
  employee?: { id: string; code: string; firstName: string; lastName: string } | null;
  terminal?: { id: string; name: string } | null;
};

export function serializeDeposit(d: DepositWithRelations) {
  return {
    id: d.id,
    employeeId: d.employeeId,
    employee: d.employee
      ? { id: d.employee.id, code: d.employee.code, name: `${d.employee.firstName} ${d.employee.lastName}` }
      : null,
    terminalId: d.terminalId,
    terminal: d.terminal ?? null,
    date: d.date,
    expectedAmount: toNumber(d.expectedAmount),
    bank: d.bank,
    referenceNumber: d.referenceNumber,
    accountSuffix: d.accountSuffix,
    phoneNumber: d.phoneNumber,
    status: d.status,
    verifyRequestId: d.verifyRequestId,
    verifiedAmount: d.verifiedAmount === null ? null : toNumber(d.verifiedAmount),
    currency: d.currency,
    senderName: d.senderName,
    receiverName: d.receiverName,
    receiverAccount: d.receiverAccount,
    verifiedAt: d.verifiedAt,
    verifyErrorMessage: d.verifyErrorMessage,
    discrepancyAmount: d.discrepancyAmount === null ? null : toNumber(d.discrepancyAmount),
    discrepancyReason: d.discrepancyReason,
    discrepancyResolvedBy: d.discrepancyResolvedBy,
    discrepancyResolvedAt: d.discrepancyResolvedAt,
    submittedAt: d.submittedAt,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

// Amounts within this many ETB of expected are treated as a match rather
// than a discrepancy — absorbs float/decimal rounding noise, not intended to
// mask real shortfalls.
export const DEPOSIT_MATCH_TOLERANCE = 0.01;

// How long we ask verify.et to hold the HTTP response open hoping for a
// synchronous result before falling back to 202 + polling. CBE/Telebirr
// verifications are typically near-instant; this just avoids making the
// cashier's browser hang if a particular bank check is slow.
export const VERIFY_ET_WAIT_MS = 8000;

function startOfDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function endOfDay(date: Date): Date {
  const start = startOfDay(date);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000);
}

// A terminal's "name" for matching against SalesTrip.departureTerminalName —
// resolves to the linked station's name when isLinkedStation, same rule
// serializeTerminal() already uses for display.
async function resolveTerminalMatchName(terminalId: string): Promise<string | null> {
  const terminal = await prisma.terminal.findUnique({
    where: { id: terminalId },
    include: { linkedStation: { select: { name: true } } },
  });
  if (!terminal) return null;
  return terminal.isLinkedStation && terminal.linkedStation ? terminal.linkedStation.name : terminal.name;
}

export async function computeExpectedDeposit(terminalId: string, date: Date): Promise<number> {
  const name = await resolveTerminalMatchName(terminalId);
  if (!name) return 0;

  const aggregate = await prisma.salesTrip.aggregate({
    where: {
      departureTerminalName: name,
      date: { gte: startOfDay(date), lt: endOfDay(date) },
    },
    _sum: { totalServiceCharge: true },
  });

  return toNumber(aggregate._sum.totalServiceCharge ?? 0);
}

// Creates today's Deposit row for a cashier/terminal pair if it doesn't
// exist yet, and keeps expectedAmount live (recomputed on every call) for as
// long as the cashier hasn't submitted anything — sales sync can still be
// trickling in trips for "today" right up until the cashier actually acts.
export async function ensureDeposit(employeeId: string, terminalId: string, date: Date) {
  const day = startOfDay(date);
  const existing = await prisma.deposit.findUnique({
    where: { employeeId_terminalId_date: { employeeId, terminalId, date: day } },
  });

  if (!existing) {
    const expectedAmount = await computeExpectedDeposit(terminalId, day);
    return prisma.deposit.create({
      data: { employeeId, terminalId, date: day, expectedAmount },
    });
  }

  if (existing.status === "AWAITING_SUBMISSION") {
    const expectedAmount = await computeExpectedDeposit(terminalId, day);
    if (Math.abs(toNumber(existing.expectedAmount) - expectedAmount) > DEPOSIT_MATCH_TOLERANCE) {
      return prisma.deposit.update({ where: { id: existing.id }, data: { expectedAmount } });
    }
  }

  return existing;
}

function statusFromResult(expectedAmount: number, result: { verified: boolean; amount?: number }): {
  status: $Enums.DepositStatus;
  discrepancyAmount: number | null;
} {
  if (!result.verified || result.amount === undefined) {
    return { status: "FAILED", discrepancyAmount: null };
  }
  const discrepancy = result.amount - expectedAmount;
  if (Math.abs(discrepancy) <= DEPOSIT_MATCH_TOLERANCE) {
    return { status: "VERIFIED_OK", discrepancyAmount: null };
  }
  return { status: "VERIFIED_MISMATCH", discrepancyAmount: discrepancy };
}

async function finalizeFromResultItem(depositId: string, expectedAmount: number, item: VerifyEtResultItem, raw: unknown) {
  const { status, discrepancyAmount } = statusFromResult(expectedAmount, item);
  return prisma.deposit.update({
    where: { id: depositId },
    data: {
      status,
      verifiedAmount: item.amount ?? null,
      currency: item.currency ?? null,
      senderName: item.senderName ?? null,
      receiverName: item.receiverName ?? null,
      receiverAccount: item.receiverAccount ?? null,
      verifiedAt: new Date(),
      verifyErrorMessage: status === "FAILED" ? "verify.et could not confirm this payment." : null,
      discrepancyAmount,
      rawVerifyResponse: raw as object,
    },
  });
}

async function finalizeFromStatusData(depositId: string, expectedAmount: number, data: VerifyEtStatusData, raw: unknown) {
  if (data.amount === undefined) {
    // Terminal state reached but no amount surfaced (e.g. GET status truly
    // doesn't carry it) — needs a human to check verify.et's own dashboard
    // rather than silently guessing at correctness.
    return prisma.deposit.update({
      where: { id: depositId },
      data: {
        status: data.verified ? "VERIFIED_OK" : "FAILED",
        verifiedAt: new Date(),
        verifyErrorMessage: data.verified
          ? "Verified by verify.et, but amount details weren't returned — please confirm manually."
          : "verify.et could not confirm this payment.",
        rawVerifyResponse: raw as object,
      },
    });
  }
  return finalizeFromResultItem(
    depositId,
    expectedAmount,
    {
      bank: data.bank ?? "",
      status: data.status,
      verified: data.verified,
      amount: data.amount,
      currency: data.currency ?? "ETB",
      senderName: data.senderName,
      receiverName: data.receiverName,
      receiverAccount: data.receiverAccount,
      referenceNumber: data.referenceNumber,
      accountSuffix: data.accountSuffix,
      timestamp: data.completedAt,
    },
    raw
  );
}

export class DepositSubmitError extends Error {}

// Submits a cashier's deposit reference to verify.et and either finalizes
// the row immediately (if verify.et responded synchronously within
// VERIFY_ET_WAIT_MS) or marks it SUBMITTED with a requestId for the fallback
// poller (see pollPendingDeposit) to pick up later.
export async function submitDeposit(
  depositId: string,
  input: DepositSubmissionInput
): Promise<Awaited<ReturnType<typeof prisma.deposit.update>>> {
  const deposit = await prisma.deposit.findUnique({ where: { id: depositId } });
  if (!deposit) throw new DepositSubmitError("Deposit not found.");
  if (deposit.status !== "AWAITING_SUBMISSION" && deposit.status !== "FAILED") {
    throw new DepositSubmitError("This deposit has already been submitted.");
  }

  const config = verifyEtConfigFromEnv();

  let response;
  try {
    response = await submitVerification(config, input, {
      waitMs: VERIFY_ET_WAIT_MS,
      idempotencyKey: `deposit-${depositId}-${Date.now()}`,
    });
  } catch (error) {
    const message = error instanceof VerifyEtError ? error.message : "Failed to reach verify.et.";
    await prisma.deposit.update({
      where: { id: depositId },
      data: {
        bank: input.bank,
        referenceNumber: input.reference,
        accountSuffix: input.accountSuffix ?? null,
        phoneNumber: input.phoneNumber ?? null,
        submittedAt: new Date(),
        status: "FAILED",
        verifyErrorMessage: message,
      },
    });
    throw error;
  }

  await prisma.deposit.update({
    where: { id: depositId },
    data: {
      bank: input.bank,
      referenceNumber: input.reference,
      accountSuffix: input.accountSuffix ?? null,
      phoneNumber: input.phoneNumber ?? null,
      submittedAt: new Date(),
      status: "SUBMITTED",
      verifyRequestId: response.requestId,
    },
  });

  const expectedAmount = toNumber(deposit.expectedAmount);
  const item = response.data?.[0];
  if (response.verification.processingStatus === "completed" && item) {
    return finalizeFromResultItem(depositId, expectedAmount, item, response);
  }

  // Still queued — leave it SUBMITTED for the poller. Try one immediate
  // status check too, in case it finished in the moment between the submit
  // response and now (cheap, and saves waiting for the next poll cycle).
  try {
    const status = await fetchVerificationStatus(config, response.requestId);
    if (status.data.processingStatus === "completed") {
      return finalizeFromStatusData(depositId, expectedAmount, status.data, status);
    }
  } catch {
    // Non-fatal — the fallback poller will retry.
  }

  return prisma.deposit.findUniqueOrThrow({ where: { id: depositId } });
}

// Fallback reconciliation for deposits stuck in SUBMITTED (verify.et hadn't
// completed by the time our own request had to return). Called both by the
// admin "Refresh" button and a periodic external poller (see
// /api/deposits/poll-pending).
export async function pollPendingDeposit(depositId: string) {
  const deposit = await prisma.deposit.findUnique({ where: { id: depositId } });
  if (!deposit) throw new DepositSubmitError("Deposit not found.");
  if (deposit.status !== "SUBMITTED" || !deposit.verifyRequestId) return deposit;

  const config = verifyEtConfigFromEnv();
  const status = await fetchVerificationStatus(config, deposit.verifyRequestId);
  if (status.data.processingStatus !== "completed") return deposit;

  return finalizeFromStatusData(depositId, toNumber(deposit.expectedAmount), status.data, status);
}
