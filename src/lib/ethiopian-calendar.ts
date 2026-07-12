// src/lib/ethiopian-calendar.ts
// Gregorian <-> Ethiopian (Ge'ez) calendar conversion, mediated through
// Julian Day Number — the standard approach used by essentially every
// correct Ethiopian calendar implementation. The Ethiopian year has 13
// months: 12 of 30 days, plus Pagume (5 days, or 6 in an Ethiopian leap
// year, where year % 4 === 3).
//
// All "current date/time" helpers here anchor to Africa/Addis_Ababa wall
// clock time (a fixed UTC+3, Ethiopia doesn't observe DST) rather than the
// server's or browser's local timezone, so the calendar date shown is
// consistent no matter where the dashboard is viewed from.

const JD_EPOCH_OFFSET_AMETE_MIHRET = 1723856;
const ADDIS_ABABA_UTC_OFFSET_MS = 3 * 60 * 60 * 1000;

export const ETHIOPIAN_MONTH_NAMES = [
  "Meskerem", "Tikimt", "Hidar", "Tahsas", "Tir", "Yekatit",
  "Megabit", "Miazia", "Ginbot", "Sene", "Hamle", "Nehase", "Pagume",
] as const;

export type EthiopianDate = { year: number; month: number; day: number };
export type EthiopianTime = { hour: number; minute: number; second: number; period: "day" | "night" };

function gregorianToJDN(year: number, month: number, day: number): number {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return day + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045;
}

function jdnToGregorian(jdn: number): { year: number; month: number; day: number } {
  const a = jdn + 32044;
  const b = Math.floor((4 * a + 3) / 146097);
  const c = a - Math.floor((146097 * b) / 4);
  const d = Math.floor((4 * c + 3) / 1461);
  const e = c - Math.floor((1461 * d) / 4);
  const m = Math.floor((5 * e + 2) / 153);
  const day = e - Math.floor((153 * m + 2) / 5) + 1;
  const month = m + 3 - 12 * Math.floor(m / 10);
  const year = 100 * b + d - 4800 + Math.floor(m / 10);
  return { year, month, day };
}

export function isEthiopianLeap(ethiopianYear: number): boolean {
  return ((ethiopianYear % 4) + 4) % 4 === 3;
}

export function gregorianToEthiopian(year: number, month: number, day: number): EthiopianDate {
  const jdn = gregorianToJDN(year, month, day);
  const offsetDays = jdn - JD_EPOCH_OFFSET_AMETE_MIHRET;
  const r = ((offsetDays % 1461) + 1461) % 1461;
  const n = (r % 365) + 365 * Math.floor(r / 1460);
  const eYear = 4 * Math.floor(offsetDays / 1461) + Math.floor(r / 365) - Math.floor(r / 1460);
  const eMonth = Math.floor(n / 30) + 1;
  const eDay = (n % 30) + 1;
  return { year: eYear, month: eMonth, day: eDay };
}

export function ethiopianToGregorian(year: number, month: number, day: number): { year: number; month: number; day: number } {
  const jdn = day + (month - 1) * 30 + Math.floor(year / 4) + 365 * year + JD_EPOCH_OFFSET_AMETE_MIHRET - 1;
  return jdnToGregorian(jdn);
}

// Shifts an instant to Addis Ababa wall-clock time, then reads its calendar
// components via UTC getters — sidesteps the server/browser's own timezone.
function toAddisWallClock(date: Date): Date {
  return new Date(date.getTime() + ADDIS_ABABA_UTC_OFFSET_MS);
}

export function dateToEthiopian(date: Date): EthiopianDate {
  const addis = toAddisWallClock(date);
  return gregorianToEthiopian(addis.getUTCFullYear(), addis.getUTCMonth() + 1, addis.getUTCDate());
}

// Ethiopian time-of-day: the 12-hour clock runs 6 hours behind the
// Western/international clock (Western 07:00 = Ethiopian 1:00 day,
// Western 19:00 = Ethiopian 1:00 night), reflecting the traditional
// sunrise-anchored day.
export function dateToEthiopianTime(date: Date): EthiopianTime {
  const addis = toAddisWallClock(date);
  const westernHour = addis.getUTCHours();
  let hour = (westernHour + 6) % 12;
  if (hour === 0) hour = 12;
  const period: EthiopianTime["period"] = westernHour >= 6 && westernHour < 18 ? "day" : "night";
  return { hour, minute: addis.getUTCMinutes(), second: addis.getUTCSeconds(), period };
}

export function formatEthiopianDate(d: EthiopianDate): string {
  return `${d.day} ${ETHIOPIAN_MONTH_NAMES[d.month - 1]} ${d.year}`;
}

export function formatEthiopianTime(t: EthiopianTime): string {
  const mm = String(t.minute).padStart(2, "0");
  const ss = String(t.second).padStart(2, "0");
  return `${t.hour}:${mm}:${ss} ${t.period === "day" ? "day" : "night"}`;
}
