// src/lib/schemas/telegram.ts
import { z } from "zod";

export const TELEGRAM_REPORT_TYPE_VALUES = ["DAILY_SALES_SUMMARY", "DAILY_DEPOSITS_SUMMARY", "CUSTOM"] as const;
export const TELEGRAM_REPORT_FOR_VALUES = ["TODAY", "YESTERDAY"] as const;
export const TELEGRAM_FREQUENCY_VALUES = ["DAILY", "EVERY_N_DAYS", "WEEKLY", "MONTHLY", "QUARTERLY", "YEARLY"] as const;

export const createRecipientSchema = z.object({
  label: z.string().min(1).max(100),
  phone: z.string().max(30).optional(),
});

const scheduleFrequencyFields = {
  frequency: z.enum(TELEGRAM_FREQUENCY_VALUES),
  intervalDays: z.number().int().min(2).max(365).optional(),
  anchorDate: z.string().date().optional(),
  weekday: z.number().int().min(0).max(6).optional(),
  dayOfMonth: z.number().int().min(1).max(31).optional(),
  monthOfYear: z.number().int().min(1).max(12).optional(),
};

function checkFrequencyFields(data: {
  frequency: (typeof TELEGRAM_FREQUENCY_VALUES)[number];
  intervalDays?: number;
  anchorDate?: string;
  weekday?: number;
  dayOfMonth?: number;
  monthOfYear?: number;
}, ctx: z.RefinementCtx) {
  switch (data.frequency) {
    case "EVERY_N_DAYS":
      if (!data.intervalDays) ctx.addIssue({ code: "custom", path: ["intervalDays"], message: "Pick how many days apart this should repeat." });
      if (!data.anchorDate) ctx.addIssue({ code: "custom", path: ["anchorDate"], message: "Pick a start date to count the interval from." });
      break;
    case "WEEKLY":
      if (data.weekday === undefined) ctx.addIssue({ code: "custom", path: ["weekday"], message: "Pick a day of the week." });
      break;
    case "MONTHLY":
    case "QUARTERLY":
      if (!data.dayOfMonth) ctx.addIssue({ code: "custom", path: ["dayOfMonth"], message: "Pick a day of the month." });
      break;
    case "YEARLY":
      if (!data.dayOfMonth) ctx.addIssue({ code: "custom", path: ["dayOfMonth"], message: "Pick a day of the month." });
      if (!data.monthOfYear) ctx.addIssue({ code: "custom", path: ["monthOfYear"], message: "Pick a month." });
      break;
    case "DAILY":
      break;
  }
}

export const createScheduleSchema = z
  .object({
    name: z.string().min(1).max(100),
    reportType: z.enum(TELEGRAM_REPORT_TYPE_VALUES),
    reportFor: z.enum(TELEGRAM_REPORT_FOR_VALUES).optional(),
    messageTemplate: z.string().max(4000).optional(),
    includeDetailedFile: z.boolean().optional(),
    ...scheduleFrequencyFields,
    sendHour: z.number().int().min(0).max(23),
    sendMinute: z.number().int().min(0).max(59),
    isActive: z.boolean().optional(),
    recipientIds: z.array(z.string().cuid()).min(1, "Pick at least one recipient."),
  })
  .superRefine((data, ctx) => {
    if (data.reportType === "CUSTOM" && !data.messageTemplate?.trim()) {
      ctx.addIssue({ code: "custom", path: ["messageTemplate"], message: "A custom schedule needs a message template." });
    }
    checkFrequencyFields(data, ctx);
  });

export const updateScheduleSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  reportType: z.enum(TELEGRAM_REPORT_TYPE_VALUES).optional(),
  reportFor: z.enum(TELEGRAM_REPORT_FOR_VALUES).optional(),
  messageTemplate: z.string().max(4000).nullable().optional(),
  includeDetailedFile: z.boolean().optional(),
  frequency: z.enum(TELEGRAM_FREQUENCY_VALUES).optional(),
  intervalDays: z.number().int().min(2).max(365).nullable().optional(),
  anchorDate: z.string().date().nullable().optional(),
  weekday: z.number().int().min(0).max(6).nullable().optional(),
  dayOfMonth: z.number().int().min(1).max(31).nullable().optional(),
  monthOfYear: z.number().int().min(1).max(12).nullable().optional(),
  sendHour: z.number().int().min(0).max(23).optional(),
  sendMinute: z.number().int().min(0).max(59).optional(),
  isActive: z.boolean().optional(),
  recipientIds: z.array(z.string().cuid()).min(1).optional(),
});

export const sendCustomMessageSchema = z.object({
  recipientIds: z.array(z.string().cuid()).min(1, "Pick at least one recipient."),
  message: z.string().min(1).max(4000),
});

export type CreateRecipientInput = z.infer<typeof createRecipientSchema>;
export type CreateScheduleInput = z.infer<typeof createScheduleSchema>;
export type UpdateScheduleInput = z.infer<typeof updateScheduleSchema>;
export type SendCustomMessageInput = z.infer<typeof sendCustomMessageSchema>;
