import type { BillingCycle, CurrencyTotal, NormalizedCost, Subscription } from "@/types";

// Pure billing arithmetic (PRD Business Logic §1–3). No I/O, no Date.now():
// `today` is always a parameter, so every function is deterministic and
// trivially testable (S-02 pins these down). Dates are ISO `YYYY-MM-DD`
// strings in and out; calendar math is integer y/m/d arithmetic (plus
// Date.UTC for day counting), so local timezones can never shift a date.
//
// "Today" is expected to be the server's UTC date. Workers run UTC, so a user
// near midnight in another timezone may see a renewal flip an hour or two
// "early" — accepted MVP limitation (date-only arithmetic, no timezone
// setting; out of PRD scope).

const MONTHS_PER_YEAR = 12;
const WEEKS_PER_YEAR = 52;
const MS_PER_DAY = 86_400_000;

/** Normalize a raw cycle amount to unrounded monthly and yearly costs (Business Logic §1). Rounding happens once, at display. */
export function normalizeCost(amount: number, cycle: BillingCycle, intervalMonths: number | null): NormalizedCost {
  switch (cycle) {
    case "weekly":
      return { monthly: (amount * WEEKS_PER_YEAR) / MONTHS_PER_YEAR, yearly: amount * WEEKS_PER_YEAR };
    case "monthly":
      return { monthly: amount, yearly: amount * MONTHS_PER_YEAR };
    case "yearly":
      return { monthly: amount / MONTHS_PER_YEAR, yearly: amount };
    case "custom": {
      const n = requireInterval(intervalMonths);
      return { monthly: amount / n, yearly: (amount * MONTHS_PER_YEAR) / n };
    }
  }
}

/**
 * Earliest anchored occurrence of the billing date on or after `today`
 * (Business Logic §2). Occurrence k is always derived from the original
 * start date (the anchor), never from a previously clamped date:
 * monthly/custom-N/yearly occurrences land on "anchor month + k·step months,
 * day = min(anchor day, days in that month)"; weekly is `start + 7k days`.
 * k = 0 (the start date itself) is a valid occurrence, so a future start
 * date is its own next renewal.
 */
export function nextRenewalDate(
  startDate: string,
  cycle: BillingCycle,
  intervalMonths: number | null,
  today: string,
): string {
  const anchor = parseIsoDate(startDate);
  parseIsoDate(today); // validate; comparisons below are lexicographic on ISO strings

  if (startDate >= today) {
    return startDate;
  }

  if (cycle === "weekly") {
    const diffDays = utcDayNumber(parseIsoDate(today)) - utcDayNumber(anchor);
    const k = Math.ceil(diffDays / 7);
    return formatIsoDate(addDays(anchor, k * 7));
  }

  const step = cycle === "monthly" ? 1 : cycle === "yearly" ? MONTHS_PER_YEAR : requireInterval(intervalMonths);

  const todayParts = parseIsoDate(today);
  const monthsElapsed = (todayParts.year - anchor.year) * MONTHS_PER_YEAR + (todayParts.month - anchor.month);
  // Floor estimate: occurrence kFloor is at most one step before today, so
  // the loop below runs a bounded, tiny number of iterations.
  let k = Math.max(0, Math.floor((monthsElapsed - 1) / step));
  for (;;) {
    const candidate = formatIsoDate(occurrenceAtMonths(anchor, k * step));
    if (candidate >= today) {
      return candidate;
    }
    k += 1;
  }
}

/** Active-only per-currency totals (Business Logic §3): sums unrounded normalized costs, sorted by currency code. */
export function summarizeActive(subscriptions: Subscription[]): CurrencyTotal[] {
  const totals = new Map<string, CurrencyTotal>();
  for (const subscription of subscriptions) {
    if (subscription.status !== "active") {
      continue;
    }
    const { monthly, yearly } = normalizeCost(
      subscription.amount,
      subscription.billing_cycle,
      subscription.billing_interval_months,
    );
    const existing = totals.get(subscription.currency);
    if (existing) {
      existing.monthly += monthly;
      existing.yearly += yearly;
    } else {
      totals.set(subscription.currency, { currency: subscription.currency, monthly, yearly });
    }
  }
  return [...totals.values()].sort((a, b) => a.currency.localeCompare(b.currency));
}

// --- internal date helpers (integer y/m/d; month is 1–12) ---

interface DateParts {
  year: number;
  month: number;
  day: number;
}

function requireInterval(intervalMonths: number | null): number {
  // Impossible via the DB pair-CHECK — defensive guard for direct callers.
  if (intervalMonths === null || !Number.isInteger(intervalMonths) || intervalMonths < 1) {
    throw new Error(`custom billing cycle requires a positive integer interval, got ${String(intervalMonths)}`);
  }
  return intervalMonths;
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  const lengths = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return lengths[month - 1];
}

function parseIsoDate(value: string): DateParts {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    throw new Error(`invalid ISO date: ${value}`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    throw new Error(`invalid calendar date: ${value}`);
  }
  return { year, month, day };
}

function formatIsoDate({ year, month, day }: DateParts): string {
  const pad = (n: number, width: number) => String(n).padStart(width, "0");
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

function utcDayNumber({ year, month, day }: DateParts): number {
  // Not Date.UTC(year, ...): it maps years 0–99 to 1900+year, which would
  // silently shift a mistyped anchor year (e.g. 0026 for 2026) by 19 centuries
  // and misalign the weekly grid. setUTCFullYear takes the year literally.
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return date.getTime() / MS_PER_DAY;
}

function addDays(parts: DateParts, days: number): DateParts {
  const date = new Date((utcDayNumber(parts) + days) * MS_PER_DAY);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

/** Anchored occurrence: anchor month + totalMonths, day clamped to that month's length (never advanced from a clamped date). */
function occurrenceAtMonths(anchor: DateParts, totalMonths: number): DateParts {
  const monthIndex = anchor.month - 1 + totalMonths;
  const year = anchor.year + Math.floor(monthIndex / MONTHS_PER_YEAR);
  const month = (monthIndex % MONTHS_PER_YEAR) + 1;
  return { year, month, day: Math.min(anchor.day, daysInMonth(year, month)) };
}
