// Property-based invariant layer for src/lib/billing.ts (research.md §2) —
// the safety net for bug classes worked examples structurally miss: anchor
// drift under arbitrary (anchor, step, k) alignments, floor/ceil boundary
// misalignment in the occurrence estimate, and extreme-year handling. The
// readable PRD-traceable spec lives in billing.test.ts.
//
// All checks reconstruct dates via UTC epoch arithmetic (setUTCFullYear, so
// years 1–99 stay literal) — deliberately no date library as oracle.
import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import { nextRenewalDate, normalizeCost } from "@/lib/billing";
import type { BillingCycle } from "@/types";

const MS_PER_DAY = 86_400_000;
const MONTHS_PER_YEAR = 12;

interface Parts {
  year: number;
  month: number;
  day: number;
}

function parts(iso: string): Parts {
  const [year, month, day] = iso.split("-").map(Number);
  return { year, month, day };
}

function epochDays(iso: string): number {
  const { year, month, day } = parts(iso);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day); // literal years, incl. 1–99
  return date.getTime() / MS_PER_DAY;
}

function isoFromEpochDays(days: number): string {
  const date = new Date(days * MS_PER_DAY);
  const pad = (n: number, width: number) => String(n).padStart(width, "0");
  return `${pad(date.getUTCFullYear(), 4)}-${pad(date.getUTCMonth() + 1, 2)}-${pad(date.getUTCDate(), 2)}`;
}

function addDaysIso(iso: string, days: number): string {
  return isoFromEpochDays(epochDays(iso) + days);
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  const lengths = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return lengths[month - 1];
}

function monthsBetween(from: Parts, to: Parts): number {
  return (to.year - from.year) * MONTHS_PER_YEAR + (to.month - from.month);
}

/** Anchored occurrence oracle for invariant 5 (mirrors the §2 day rule, independent code path from billing.ts). */
function occurrenceIso(anchor: Parts, totalMonths: number): string {
  const monthIndex = anchor.month - 1 + totalMonths;
  const year = anchor.year + Math.floor(monthIndex / MONTHS_PER_YEAR);
  const month = (monthIndex % MONTHS_PER_YEAR) + 1;
  const day = Math.min(anchor.day, daysInMonth(year, month));
  const pad = (n: number, width: number) => String(n).padStart(width, "0");
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

// Anchors capped at year 9500 and `today` at anchor + 170,000 days (~465
// years) keep every reachable occurrence (≤ today + 120 months) inside years
// 0001–9999 — the domain where ISO strings compare lexicographically and
// formatIsoDate's 4-digit padding holds (research.md Open Questions). Years
// 1–99 stay generatable, so the F1 class is covered by generation too.
const anchorArb = fc
  .date({ min: new Date("0001-01-01T00:00:00Z"), max: new Date("9500-12-31T00:00:00Z"), noInvalidDate: true })
  .map((d) => d.toISOString().slice(0, 10));
const offsetArb = fc.integer({ min: 0, max: 170_000 });

const monthCycleArb = fc.oneof(
  fc.record({ cycle: fc.constantFrom<BillingCycle>("monthly", "yearly"), interval: fc.constant<number | null>(null) }),
  fc.record({ cycle: fc.constant<BillingCycle>("custom"), interval: fc.integer({ min: 1, max: 120 }) }),
);
const anyCycleArb = fc.oneof(
  monthCycleArb,
  fc.record({ cycle: fc.constant<BillingCycle>("weekly"), interval: fc.constant<number | null>(null) }),
);

function stepOf(cycle: BillingCycle, interval: number | null): number {
  return cycle === "monthly" ? 1 : cycle === "yearly" ? MONTHS_PER_YEAR : (interval ?? 1);
}

describe("nextRenewalDate invariants (research.md §2)", () => {
  test.prop([anchorArb, offsetArb, anyCycleArb])("1. bound: result >= today", (anchor, offset, { cycle, interval }) => {
    const today = addDaysIso(anchor, offset);
    expect(nextRenewalDate(anchor, cycle, interval, today) >= today).toBe(true);
  });

  test.prop([anchorArb, offsetArb, anyCycleArb])(
    "2. validity: result is a real calendar date in YYYY-MM-DD",
    (anchor, offset, { cycle, interval }) => {
      const today = addDaysIso(anchor, offset);
      const result = nextRenewalDate(anchor, cycle, interval, today);
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      // UTC epoch reconstruction round-trips only real calendar dates.
      expect(isoFromEpochDays(epochDays(result))).toBe(result);
    },
  );

  test.prop([anchorArb, offsetArb, monthCycleArb])(
    "3. clamping: day = min(anchor day, month length); months from anchor ≡ 0 (mod step)",
    (anchor, offset, { cycle, interval }) => {
      const today = addDaysIso(anchor, offset);
      const result = parts(nextRenewalDate(anchor, cycle, interval, today));
      const anchorParts = parts(anchor);
      expect(result.day).toBe(Math.min(anchorParts.day, daysInMonth(result.year, result.month)));
      const months = monthsBetween(anchorParts, result);
      expect(months).toBeGreaterThanOrEqual(0);
      expect(months % stepOf(cycle, interval)).toBe(0);
    },
  );

  test.prop([anchorArb, offsetArb, monthCycleArb])(
    "4. anchor immutability: chaining occurrences never drifts off the anchor day",
    (anchor, offset, { cycle, interval }) => {
      const anchorParts = parts(anchor);
      let today = addDaysIso(anchor, offset);
      // 14 chained occurrences cross at least one February for monthly cycles;
      // a clamped short month must never poison the following long month.
      for (let i = 0; i < 14; i += 1) {
        if (today > "9899-12-31") {
          // Stay inside the module's year 0001–9999 domain: a custom-120 chain
          // from here would step past 9999, which parseIsoDate rightly rejects.
          break;
        }
        const occurrence = nextRenewalDate(anchor, cycle, interval, today);
        const occurrenceParts = parts(occurrence);
        expect(occurrenceParts.day).toBe(
          Math.min(anchorParts.day, daysInMonth(occurrenceParts.year, occurrenceParts.month)),
        );
        today = addDaysIso(occurrence, 1);
      }
    },
  );

  test.prop([anchorArb, offsetArb, monthCycleArb])(
    "5. minimality: the occurrence one step earlier is < today",
    (anchor, offset, { cycle, interval }) => {
      const today = addDaysIso(anchor, offset);
      const result = nextRenewalDate(anchor, cycle, interval, today);
      const anchorParts = parts(anchor);
      const months = monthsBetween(anchorParts, parts(result));
      const step = stepOf(cycle, interval);
      if (months >= step) {
        expect(occurrenceIso(anchorParts, months - step) < today).toBe(true);
      } else {
        // k = 0: the result is the anchor itself (future or same-day start).
        expect(result).toBe(anchor);
      }
    },
  );

  test.prop([anchorArb, offsetArb])(
    "6. weekly grid: result − anchor ≡ 0 (mod 7 days), previous < today",
    (anchor, offset) => {
      const today = addDaysIso(anchor, offset);
      const result = nextRenewalDate(anchor, "weekly", null, today);
      const diffDays = epochDays(result) - epochDays(anchor);
      expect(diffDays).toBeGreaterThanOrEqual(0);
      expect(diffDays % 7).toBe(0);
      expect(addDaysIso(result, -7) < today).toBe(true);
    },
  );

  test.prop([anchorArb, offsetArb, anyCycleArb])(
    "7. idempotence: nextRenewalDate(start, cycle, n, result) === result",
    (anchor, offset, { cycle, interval }) => {
      const today = addDaysIso(anchor, offset);
      const result = nextRenewalDate(anchor, cycle, interval, today);
      expect(nextRenewalDate(anchor, cycle, interval, result)).toBe(result);
    },
  );
});

describe("normalizeCost invariant (Business Logic §1)", () => {
  test.prop([
    fc.double({ min: 0.01, max: 1_000_000, noNaN: true, noDefaultInfinity: true }),
    fc.oneof(
      fc.record({
        cycle: fc.constantFrom<BillingCycle>("weekly", "monthly", "yearly"),
        interval: fc.constant<number | null>(null),
      }),
      fc.record({ cycle: fc.constant<BillingCycle>("custom"), interval: fc.integer({ min: 1, max: 120 }) }),
    ),
  ])("yearly === monthly × 12 (within float tolerance)", (amount, { cycle, interval }) => {
    const { monthly, yearly } = normalizeCost(amount, cycle, interval);
    expect(Math.abs(yearly - monthly * 12)).toBeLessThanOrEqual(Math.abs(yearly) * 1e-12 + Number.EPSILON);
  });
});
