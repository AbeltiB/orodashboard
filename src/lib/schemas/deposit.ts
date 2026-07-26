// src/lib/schemas/deposit.ts
import { z } from "zod";
import { VERIFY_ET_SUBMITTABLE_BANKS, type VerifyEtBank } from "@/lib/verify-et/client";

type SubmittableBank = Exclude<VerifyEtBank, "zemen">;
const BANK_VALUES = VERIFY_ET_SUBMITTABLE_BANKS as unknown as [SubmittableBank, ...SubmittableBank[]];

export const submitDepositSchema = z
  .object({
    bank: z.enum(BANK_VALUES),
    reference: z.string().min(3).max(100),
    accountSuffix: z.string().optional(),
    phoneNumber: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if ((data.bank === "cbe" && !/^\d{8}$/.test(data.accountSuffix ?? "")) ) {
      ctx.addIssue({ code: "custom", path: ["accountSuffix"], message: "CBE requires an 8-digit account suffix." });
    }
    if (data.bank === "boa" && !/^\d{5}$/.test(data.accountSuffix ?? "")) {
      ctx.addIssue({ code: "custom", path: ["accountSuffix"], message: "Bank of Abyssinia requires a 5-digit account suffix." });
    }
    if (data.bank === "cbebirr" && !data.phoneNumber?.trim()) {
      ctx.addIssue({ code: "custom", path: ["phoneNumber"], message: "CBE Birr requires the depositor's phone number." });
    }
  });

export const discrepancyReasonSchema = z.object({
  reason: z.string().min(1).max(1000),
});

export type SubmitDepositInput = z.infer<typeof submitDepositSchema>;
export type DiscrepancyReasonInput = z.infer<typeof discrepancyReasonSchema>;
