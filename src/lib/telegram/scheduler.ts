// src/lib/telegram/scheduler.ts
// Core send logic: building a schedule's content once and fanning it out to
// its linked recipients, deciding which schedules are due right now, and
// polling Telegram's getUpdates to turn a recipient's first /start message
// into a linked telegramChatId.
import { prisma } from "@/lib/prisma";
import { sendTelegramMessage, sendTelegramDocument, getTelegramUpdates, telegramConfigFromEnv } from "./client";
import {
  buildDailySalesReport, buildDailyDepositsReport, buildServiceChargeBreakdownReport, buildStationServiceChargeReport,
  buildMonthlySalesReport, renderCustomTemplate, resolveReportDate, addisNowParts,
} from "./reports";
import { buildDetailedWorkbook } from "./workbook";
import { gregorianToEthiopian } from "@/lib/ethiopian-calendar";
import type { $Enums } from "@/generated/prisma/client";

const UPDATES_OFFSET_KEY = "telegram_updates_offset";

// Last day-of-month for a given Addis-local year/month (1-12) — used to
// clamp e.g. dayOfMonth=31 down to Feb's actual 28/29 rather than skipping
// that month entirely.
function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

// Whether `schedule` is due to fire on the given Addis-local calendar day —
// the actual recurrence rule per TelegramFrequency. Time-of-day (sendHour/
// sendMinute) and the lastRunDate dedup guard are checked separately by the
// caller; this only answers "is today the right *day*."
export function isScheduleDueToday(
  schedule: {
    frequency: $Enums.TelegramFrequency;
    intervalDays: number | null;
    anchorDate: Date | null;
    weekday: number | null;
    dayOfMonth: number | null;
    monthOfYear: number | null;
  },
  todayParts: { year: number; month: number; day: number }
): boolean {
  const { year, month, day } = todayParts;

  switch (schedule.frequency) {
    case "DAILY":
      return true;

    case "EVERY_N_DAYS": {
      if (!schedule.intervalDays || !schedule.anchorDate) return false;
      const todayUTC = Date.UTC(year, month - 1, day);
      const diffDays = Math.round((todayUTC - schedule.anchorDate.getTime()) / (24 * 60 * 60 * 1000));
      return diffDays >= 0 && diffDays % schedule.intervalDays === 0;
    }

    case "WEEKLY": {
      if (schedule.weekday === null || schedule.weekday === undefined) return false;
      const jsWeekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0 = Sunday
      return jsWeekday === schedule.weekday;
    }

    case "MONTHLY": {
      if (!schedule.dayOfMonth) return false;
      return day === Math.min(schedule.dayOfMonth, lastDayOfMonth(year, month));
    }

    case "QUARTERLY": {
      if (!schedule.dayOfMonth) return false;
      if (![1, 4, 7, 10].includes(month)) return false;
      return day === Math.min(schedule.dayOfMonth, lastDayOfMonth(year, month));
    }

    case "YEARLY": {
      if (!schedule.dayOfMonth || !schedule.monthOfYear) return false;
      if (month !== schedule.monthOfYear) return false;
      return day === Math.min(schedule.dayOfMonth, lastDayOfMonth(year, month));
    }

    case "ETHIOPIAN_MONTHLY":
      // Every Ethiopian month's 1st day — a moving Gregorian date, so no
      // dayOfMonth field to check, just convert today and look at its day.
      return gregorianToEthiopian(year, month, day).day === 1;
  }
}

// One or more message parts to send in sequence — almost always a single
// element, except DAILY_SERVICE_CHARGE_BREAKDOWN, which can span several
// messages on a busy day to stay under Telegram's per-message char limit
// without truncating any station/ticketer/route out of the report.
export async function buildReportContent(
  schedule: { reportType: $Enums.TelegramReportType; messageTemplate: string | null },
  date: Date
): Promise<string[]> {
  switch (schedule.reportType) {
    case "DAILY_SALES_SUMMARY":
      return [await buildDailySalesReport(date)];
    case "DAILY_DEPOSITS_SUMMARY":
      return [await buildDailyDepositsReport(date)];
    case "DAILY_SERVICE_CHARGE_BREAKDOWN":
      return buildServiceChargeBreakdownReport(date);
    case "MONTHLY_SALES_SUMMARY":
      // Ignores reportFor/date — always resolves its own "previous Ethiopian
      // month" range relative to right now, same precedent as CUSTOM
      // ignoring reportFor for its {{date}} placeholder.
      return buildMonthlySalesReport();
    case "CUSTOM":
      return [renderCustomTemplate(schedule.messageTemplate ?? "", date)];
  }
}

export async function runSchedule(scheduleId: string): Promise<{ sent: number; failed: number }> {
  const schedule = await prisma.telegramSchedule.findUnique({
    where: { id: scheduleId },
    include: { recipients: { include: { recipient: { include: { station: { select: { id: true, name: true } } } } } } },
  });
  if (!schedule) throw new Error("Schedule not found.");
  const reportType = schedule.reportType;
  const messageTemplate = schedule.messageTemplate;
  const includeDetailedFile = schedule.includeDetailedFile;

  // Resolved once so the text recap and the attached workbook always agree
  // on exactly which calendar day they cover, even right at a midnight
  // boundary between the two being built.
  const date = resolveReportDate(schedule.reportFor);
  const config = telegramConfigFromEnv();

  const linkedRecipients = schedule.recipients
    .map((r) => r.recipient)
    .filter((r) => r.isActive && r.telegramChatId);

  // Station-scoped recipients only apply to DAILY_SERVICE_CHARGE_BREAKDOWN —
  // everyone else, and every other report type, gets the schedule's one
  // shared build. Built lazily and cached per distinct scope, so several
  // recipients on the same station (or the "everyone" build) only trigger
  // one query each rather than one per recipient.
  const contentCache = new Map<string, Promise<string[]>>();
  function contentFor(recipient: (typeof linkedRecipients)[number]): Promise<string[]> {
    const scoped = reportType === "DAILY_SERVICE_CHARGE_BREAKDOWN" && recipient.stationId && recipient.station;
    const scopeKey = scoped ? `station:${recipient.stationId}` : "full";
    let cached = contentCache.get(scopeKey);
    if (!cached) {
      cached = scoped
        ? buildStationServiceChargeReport(date, recipient.stationId!, recipient.station!.name)
        : buildReportContent({ reportType, messageTemplate }, date);
      contentCache.set(scopeKey, cached);
    }
    return cached;
  }

  // Same per-scope caching for the attached file (Excel for most report
  // types, PDF for DAILY_SERVICE_CHARGE_BREAKDOWN) — critical for the
  // scoped case: a station-scoped recipient must get a file containing only
  // their own station, never the full company-wide one.
  type DetailedFile = { buffer: Buffer; filename: string; mimeType: string } | null;
  const fileCache = new Map<string, Promise<DetailedFile>>();
  function fileFor(recipient: (typeof linkedRecipients)[number]): Promise<DetailedFile> {
    if (!includeDetailedFile) return Promise.resolve(null);
    const scoped = reportType === "DAILY_SERVICE_CHARGE_BREAKDOWN" && recipient.stationId && recipient.station;
    const scopeKey = scoped ? `station:${recipient.stationId}` : "full";
    let cached = fileCache.get(scopeKey);
    if (!cached) {
      cached = buildDetailedWorkbook(reportType, date, scoped ? { stationId: recipient.stationId!, stationName: recipient.station!.name } : undefined);
      fileCache.set(scopeKey, cached);
    }
    return cached;
  }

  let sent = 0;
  let failed = 0;

  for (const recipient of linkedRecipients) {
    let recipientFailed = false;
    const contentParts = await contentFor(recipient);

    // Sent as separate messages in order (almost always just one) rather
    // than one giant send, so a report that spans Telegram's 4096-char
    // limit still delivers every part instead of failing outright — a
    // failure on one part doesn't stop the rest from still going out.
    for (const part of contentParts) {
      try {
        await sendTelegramMessage(config, recipient.telegramChatId!, part);
        await prisma.telegramMessageLog.create({
          data: { scheduleId: schedule.id, recipientId: recipient.id, reportType: schedule.reportType, content: part, status: "SENT" },
        });
      } catch (error) {
        recipientFailed = true;
        await prisma.telegramMessageLog.create({
          data: {
            scheduleId: schedule.id,
            recipientId: recipient.id,
            reportType: schedule.reportType,
            content: part,
            status: "FAILED",
            errorMessage: error instanceof Error ? error.message : "Unknown error.",
          },
        });
      }
    }

    const file = await fileFor(recipient);
    if (file) {
      try {
        await sendTelegramDocument(config, recipient.telegramChatId!, file.buffer, file.filename, file.mimeType);
        await prisma.telegramMessageLog.create({
          data: { scheduleId: schedule.id, recipientId: recipient.id, reportType: schedule.reportType, content: `[Attached: ${file.filename}]`, status: "SENT" },
        });
      } catch (fileError) {
        recipientFailed = true;
        await prisma.telegramMessageLog.create({
          data: {
            scheduleId: schedule.id, recipientId: recipient.id, reportType: schedule.reportType,
            content: `[Attached: ${file.filename}]`, status: "FAILED",
            errorMessage: fileError instanceof Error ? fileError.message : "Unknown error.",
          },
        });
      }
    }

    if (recipientFailed) {
      failed++;
    } else {
      sent++;
    }
  }

  const { year, month, day } = addisNowParts();
  await prisma.telegramSchedule.update({
    where: { id: schedule.id },
    data: {
      lastRunDate: new Date(Date.UTC(year, month - 1, day)),
      lastRunStatus: `${sent} sent, ${failed} failed`,
    },
  });

  return { sent, failed };
}

// Fires every active schedule whose configured local time has passed for
// "today" (Addis time) and hasn't already run today — safe to call from a
// cron on any cadence (every 1-15 min all work identically) since lastRunDate
// is the actual dedup guard, not the poll interval.
export async function runDueSchedules(): Promise<{ checked: number; ran: string[] }> {
  const { year, month, day, hour, minute } = addisNowParts();
  const todayKey = new Date(Date.UTC(year, month - 1, day));

  const schedules = await prisma.telegramSchedule.findMany({ where: { isActive: true } });
  const ran: string[] = [];

  for (const schedule of schedules) {
    const alreadyRanToday = schedule.lastRunDate && schedule.lastRunDate.getTime() === todayKey.getTime();
    if (alreadyRanToday) continue;

    if (!isScheduleDueToday(schedule, { year, month, day })) continue;

    const timeDue = hour > schedule.sendHour || (hour === schedule.sendHour && minute >= schedule.sendMinute);
    if (!timeDue) continue;

    try {
      await runSchedule(schedule.id);
      ran.push(schedule.id);
    } catch (error) {
      // Leave lastRunDate untouched so a transient failure (e.g. Telegram
      // briefly down, or TELEGRAM_BOT_TOKEN not configured yet) gets retried
      // on the next poll rather than silently skipping the whole day —
      // logged so it's still visible in server logs, not just swallowed.
      console.error(`[telegram] schedule ${schedule.id} (${schedule.name}) failed to run:`, error);
    }
  }

  return { checked: schedules.length, ran };
}

// Long-poll fallback for linking: consumes any pending /start <linkToken>
// messages sent to the bot and attaches the sender's chat id to the matching
// TelegramRecipient row. Safe to call repeatedly/concurrently-ish — advances
// the stored offset only after each update is processed.
export async function runUpdatesPoll(): Promise<{ processed: number; linked: number }> {
  const config = telegramConfigFromEnv();

  const offsetRow = await prisma.systemConfig.findUnique({ where: { key: UPDATES_OFFSET_KEY } });
  const offset = offsetRow ? parseInt(offsetRow.value, 10) : undefined;

  const updates = await getTelegramUpdates(config, offset);
  let linked = 0;

  for (const update of updates) {
    const text = update.message?.text?.trim();
    const chatId = update.message?.chat.id;
    if (text && chatId && text.startsWith("/start")) {
      const token = text.replace("/start", "").trim();
      if (token) {
        const result = await prisma.telegramRecipient.updateMany({
          where: { linkToken: token, telegramChatId: null },
          data: {
            telegramChatId: String(chatId),
            telegramUsername: update.message?.from?.username ?? null,
            telegramFirstName: update.message?.from?.first_name ?? null,
            linkedAt: new Date(),
          },
        });
        if (result.count > 0) linked++;
      }
    }
  }

  if (updates.length > 0) {
    const nextOffset = updates[updates.length - 1].update_id + 1;
    await prisma.systemConfig.upsert({
      where: { key: UPDATES_OFFSET_KEY },
      create: { key: UPDATES_OFFSET_KEY, value: String(nextOffset), description: "Telegram getUpdates offset" },
      update: { value: String(nextOffset) },
    });
  }

  return { processed: updates.length, linked };
}
