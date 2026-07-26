// src/lib/verify-et/client.ts
// Client for https://verify.et — verifies Ethiopian bank/mobile-money
// deposit receipts by reference number. Contract confirmed against the
// live API reference on 2026-07-26 (auth header, endpoints, request/response
// shapes below are taken directly from it, not guessed).

export type VerifyEtBank =
  | "cbe"
  | "boa"
  | "telebirr"
  | "mpesa"
  | "cbebirr"
  | "dashen"
  | "awash"
  | "siinqee"
  | "kaafiebirr"
  | "zemen";

// zemen is enum/status-surface only — POST /api/verify returns "unsupported"
// for direct Zemen submissions, so it's excluded from the cashier-facing bank
// picker (see src/lib/schemas/deposit.ts) even though the type above lists it
// for completeness against the source's own enum.
export const VERIFY_ET_SUBMITTABLE_BANKS: Exclude<VerifyEtBank, "zemen">[] = [
  "cbe",
  "boa",
  "telebirr",
  "mpesa",
  "cbebirr",
  "dashen",
  "awash",
  "siinqee",
  "kaafiebirr",
];

export const VERIFY_ET_BANK_LABELS: Record<VerifyEtBank, string> = {
  cbe: "Commercial Bank of Ethiopia (CBE)",
  boa: "Bank of Abyssinia",
  telebirr: "Telebirr",
  mpesa: "M-Pesa",
  cbebirr: "CBE Birr",
  dashen: "Dashen Bank",
  awash: "Awash Bank",
  siinqee: "Siinqee Bank",
  kaafiebirr: "Kaafi eBirr",
  zemen: "Zemen Bank",
};

export type VerifyEtConfig = { baseUrl: string; apiKey: string };

export function verifyEtConfigFromEnv(): VerifyEtConfig {
  const baseUrl = process.env.VERIFY_ET_BASE_URL || "https://verify.et";
  const apiKey = process.env.VERIFY_ET_API_KEY;
  if (!apiKey) {
    throw new Error("Missing VERIFY_ET_API_KEY environment variable.");
  }
  return { baseUrl, apiKey };
}

export class VerifyEtError extends Error {
  status: number;
  code?: string;
  retryAfterSeconds?: number;

  constructor(message: string, status: number, code?: string, retryAfterSeconds?: number) {
    super(message);
    this.name = "VerifyEtError";
    this.status = status;
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

// What our own submission form collects from a cashier — mapped onto
// verify.et's bank-specific required fields per its "Supported Banks &
// Required Fields" table.
export type DepositSubmissionInput = {
  bank: Exclude<VerifyEtBank, "zemen">;
  reference: string; // referenceNumber / transactionNumber / receiptNumber depending on bank
  accountSuffix?: string; // cbe (8 digits) / boa (5 digits)
  phoneNumber?: string; // cbebirr (required) / kaafiebirr (optional)
};

function buildVerifyRequestBody(input: DepositSubmissionInput, webhookUrl?: string): Record<string, unknown> {
  const body: Record<string, unknown> = { bank: input.bank };

  switch (input.bank) {
    case "cbe":
    case "boa":
      body.referenceNumber = input.reference;
      body.accountSuffix = input.accountSuffix;
      break;
    case "telebirr":
    case "mpesa":
      body.transactionNumber = input.reference;
      break;
    case "cbebirr":
      body.receiptNumber = input.reference;
      body.phone = input.phoneNumber;
      break;
    case "dashen":
    case "awash":
    case "siinqee":
      body.referenceNumber = input.reference;
      break;
    case "kaafiebirr":
      body.referenceNumber = input.reference;
      if (input.phoneNumber) body.phone = input.phoneNumber;
      break;
  }

  if (webhookUrl) body.webhookUrl = webhookUrl;
  return body;
}

export type VerifyEtConfirmationHistory = {
  scope?: string;
  isFirstConfirmation?: boolean;
  confirmedBefore?: boolean;
  firstConfirmedAt?: string;
  lastConfirmedAt?: string;
  confirmationCount?: number;
};

export type VerifyEtResultItem = {
  bank: string;
  status: string;
  verified: boolean;
  amount: number;
  currency: string;
  senderName?: string;
  receiverName?: string;
  receiverAccount?: string;
  referenceNumber?: string;
  accountSuffix?: string;
  timestamp?: string;
  confirmationHistory?: VerifyEtConfirmationHistory;
  settlementAccountMatch?: unknown;
};

export type VerifyEtVerificationState = {
  requestId: string;
  bank?: string;
  processingStatus: "queued" | "running" | "completed" | string;
  status: "pending" | "success" | "failed" | string;
  verified: boolean;
  completedAt?: string;
};

export type VerifyEtSubmitResponse = {
  success: boolean;
  message: string;
  data: VerifyEtResultItem[];
  requestId: string;
  verification: VerifyEtVerificationState;
  links?: { statusUrl?: string; pollAfterMs?: number; webhookRegistered?: boolean };
  statusUrl?: string;
  estimatedWaitMs?: number;
};

// POST /api/verify — queues a verification; if it completes within `waitMs`
// the response is a synchronous 200 with the result in `data`, otherwise a
// 202 with just a requestId/statusUrl to poll (see fetchVerificationStatus).
export async function submitVerification(
  config: VerifyEtConfig,
  input: DepositSubmissionInput,
  options: { waitMs?: number; idempotencyKey?: string; webhookUrl?: string } = {}
): Promise<VerifyEtSubmitResponse> {
  const url = new URL(`${config.baseUrl}/api/verify`);
  if (options.waitMs) url.searchParams.set("waitMs", String(options.waitMs));

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-api-key": config.apiKey,
  };
  if (options.idempotencyKey) headers["Idempotency-Key"] = options.idempotencyKey;

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(buildVerifyRequestBody(input, options.webhookUrl)),
  });

  const body = await res.json().catch(() => ({}) as Record<string, unknown>);

  if (res.status === 200 || res.status === 202) {
    return body as VerifyEtSubmitResponse;
  }

  if (res.status === 401) throw new VerifyEtError("verify.et rejected our API key.", 401, "invalid_api_key");
  if (res.status === 403) throw new VerifyEtError("verify.et API key lacks verification:write permission.", 403, "forbidden");
  if (res.status === 409) throw new VerifyEtError("This reference was already submitted (idempotency conflict).", 409, "idempotency_conflict");
  if (res.status === 422) {
    throw new VerifyEtError(
      (body as { message?: string }).message || "verify.et rejected the payload for this bank.",
      422,
      "invalid_payload"
    );
  }
  if (res.status === 429) {
    const retryAfter = Number(res.headers.get("Retry-After")) || undefined;
    throw new VerifyEtError("verify.et rate limit exceeded — try again shortly.", 429, "rate_limited", retryAfter);
  }
  if (res.status === 402) throw new VerifyEtError("verify.et verification credits exhausted.", 402, "credits_exhausted");
  if (res.status === 503) throw new VerifyEtError("verify.et verification queue is temporarily unavailable.", 503, "queue_unavailable");

  throw new VerifyEtError(
    (body as { message?: string }).message || `verify.et request failed (HTTP ${res.status}).`,
    res.status
  );
}

// The documented example response only shows the status subset (no amount/
// sender fields) — but the webhook delivery payload for the same terminal
// state *does* include them, so we type this loosely and read whichever
// fields are actually present rather than assuming the trimmed doc example
// is the complete shape.
export type VerifyEtStatusData = VerifyEtVerificationState & Partial<VerifyEtResultItem>;

// GET /api/verify/:requestId — used to finish resolving a 202 (queued)
// submission, either via a fallback poller or right before trusting an
// inbound webhook payload (webhooks aren't guaranteed signed, so we always
// re-confirm status directly with our own API key rather than trusting the
// webhook body alone).
export async function fetchVerificationStatus(
  config: VerifyEtConfig,
  requestId: string
): Promise<{ success: boolean; message: string; data: VerifyEtStatusData }> {
  const res = await fetch(`${config.baseUrl}/api/verify/${requestId}`, {
    headers: { "x-api-key": config.apiKey },
  });
  const body = await res.json().catch(() => ({}) as Record<string, unknown>);
  if (!res.ok) {
    throw new VerifyEtError(
      (body as { message?: string }).message || `verify.et status check failed (HTTP ${res.status}).`,
      res.status
    );
  }
  return body as { success: boolean; message: string; data: VerifyEtStatusData };
}
