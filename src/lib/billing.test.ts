// Example-based specification of src/lib/billing.ts, traceable to PRD
// Business Logic §1–§3 and US-01/US-02 (context/foundation/prd.md). Each case
// cites its source so a failure reads as a spec violation. The generated-input
// safety net lives in billing.properties.test.ts.
import { describe, expect, it } from "vitest";
import { nextRenewalDate, normalizeCost, summarizeActive, upcomingRenewals } from "@/lib/billing";
import type { Subscription } from "@/types";

let fixtureCount = 0;

/** Full Subscription row with sane defaults; override what the case is about. */
function sub(overrides: Partial<Subscription> = {}): Subscription {
  fixtureCount += 1;
  return {
    id: `00000000-0000-4000-8000-${String(fixtureCount).padStart(12, "0")}`,
    user_id: "00000000-0000-4000-8000-000000000000",
    name: `Fixture ${String(fixtureCount)}`,
    amount: 10,
    currency: "PLN",
    billing_cycle: "monthly",
    billing_interval_months: null,
    category: "Other",
    status: "active",
    start_date: "2026-01-01",
    note: null,
    created_at: "2026-01-01T00:00:00+00:00",
    updated_at: "2026-01-01T00:00:00+00:00",
    ...overrides,
  };
}

describe("normalizeCost (Business Logic §1)", () => {
  // Values are asserted as exact expressions, never decimal literals:
  // normalizeCost returns unrounded numbers (rounding happens only at display).
  it("weekly: monthly = amount × 52 / 12, yearly = amount × 52", () => {
    expect(normalizeCost(43, "weekly", null)).toEqual({ monthly: (43 * 52) / 12, yearly: 43 * 52 });
  });

  it("monthly: US-01 Netflix 43 → monthly 43, yearly 516", () => {
    expect(normalizeCost(43, "monthly", null)).toEqual({ monthly: 43, yearly: 43 * 12 });
    expect(normalizeCost(43, "monthly", null).yearly).toBe(516);
  });

  it("yearly: monthly = amount / 12, yearly = amount", () => {
    expect(normalizeCost(516, "yearly", null)).toEqual({ monthly: 516 / 12, yearly: 516 });
  });

  it("custom-3: monthly = amount / 3, yearly = amount × 12 / 3", () => {
    expect(normalizeCost(90, "custom", 3)).toEqual({ monthly: 90 / 3, yearly: (90 * 12) / 3 });
  });

  it("custom-1 behaves like monthly", () => {
    expect(normalizeCost(43, "custom", 1)).toEqual({ monthly: 43, yearly: 43 * 12 });
  });

  it("custom-18: unrounded division survives (no decimal-literal noise)", () => {
    expect(normalizeCost(100, "custom", 18)).toEqual({ monthly: 100 / 18, yearly: (100 * 12) / 18 });
  });

  it("custom with null interval throws", () => {
    expect(() => normalizeCost(10, "custom", null)).toThrow(/positive integer interval/);
  });

  it("custom with non-integer interval throws", () => {
    expect(() => normalizeCost(10, "custom", 2.5)).toThrow(/positive integer interval/);
  });

  it("custom with interval < 1 throws", () => {
    expect(() => normalizeCost(10, "custom", 0)).toThrow(/positive integer interval/);
    expect(() => normalizeCost(10, "custom", -3)).toThrow(/positive integer interval/);
  });
});

describe("nextRenewalDate (Business Logic §2)", () => {
  it("US-01: monthly start 2026-07-15, today 2026-08-01 → 2026-08-15", () => {
    expect(nextRenewalDate("2026-07-15", "monthly", null, "2026-08-01")).toBe("2026-08-15");
  });

  describe("US-02: month-end clamping stays anchored", () => {
    it("monthly start 2026-01-31, viewed during February 2026 → 2026-02-28 (clamped)", () => {
      expect(nextRenewalDate("2026-01-31", "monthly", null, "2026-02-10")).toBe("2026-02-28");
    });

    it("monthly start 2026-01-31, viewed during March 2026 → 2026-03-31 (anchored, no drift to the 28th)", () => {
      expect(nextRenewalDate("2026-01-31", "monthly", null, "2026-03-01")).toBe("2026-03-31");
    });

    it("leap-year February: monthly start 2027-01-31, viewed February 2028 → 2028-02-29", () => {
      expect(nextRenewalDate("2027-01-31", "monthly", null, "2028-02-01")).toBe("2028-02-29");
    });

    it("US-02 AC: yearly start 2024-02-29 renews 2027-02-28 in a non-leap year (clamped)", () => {
      expect(nextRenewalDate("2024-02-29", "yearly", null, "2026-03-01")).toBe("2027-02-28");
    });

    it("US-02 AC: yearly start 2024-02-29 renews 2028-02-29 in a leap year (restored)", () => {
      expect(nextRenewalDate("2024-02-29", "yearly", null, "2027-03-01")).toBe("2028-02-29");
    });

    it("US-02 AC: custom-3 chain from 2026-01-31 → Apr 30 → Jul 31 → Oct 31 (clamping never rewrites the anchor)", () => {
      expect(nextRenewalDate("2026-01-31", "custom", 3, "2026-02-01")).toBe("2026-04-30");
      expect(nextRenewalDate("2026-01-31", "custom", 3, "2026-05-01")).toBe("2026-07-31");
      expect(nextRenewalDate("2026-01-31", "custom", 3, "2026-08-01")).toBe("2026-10-31");
    });
  });

  describe("30-day-month clamp (§2 day rule)", () => {
    it("monthly start on the 31st clamps to day 30 in April, June, September, November", () => {
      expect(nextRenewalDate("2026-03-31", "monthly", null, "2026-04-01")).toBe("2026-04-30");
      expect(nextRenewalDate("2026-05-31", "monthly", null, "2026-06-15")).toBe("2026-06-30");
      expect(nextRenewalDate("2026-08-31", "monthly", null, "2026-09-01")).toBe("2026-09-30");
      expect(nextRenewalDate("2026-10-31", "monthly", null, "2026-11-02")).toBe("2026-11-30");
    });
  });

  describe("today == occurrence returns today (§2: earliest occurrence on or after today)", () => {
    it("on a clamped occurrence (2026-02-28 for anchor 2026-01-31)", () => {
      expect(nextRenewalDate("2026-01-31", "monthly", null, "2026-02-28")).toBe("2026-02-28");
    });

    it("on an unclamped occurrence (2026-03-31 for anchor 2026-01-31)", () => {
      expect(nextRenewalDate("2026-01-31", "monthly", null, "2026-03-31")).toBe("2026-03-31");
    });

    it("on a weekly grid point (2020-02-29 + 336 weeks = 2026-08-08)", () => {
      expect(nextRenewalDate("2020-02-29", "weekly", null, "2026-08-08")).toBe("2026-08-08");
    });
  });

  describe("future start date is its own next renewal (§2, k = 0)", () => {
    it.each(["weekly", "monthly", "yearly"] as const)("%s", (cycle) => {
      expect(nextRenewalDate("2026-12-01", cycle, null, "2026-08-08")).toBe("2026-12-01");
    });

    it("custom-6", () => {
      expect(nextRenewalDate("2026-12-01", "custom", 6, "2026-08-08")).toBe("2026-12-01");
    });
  });

  describe("weekly grid: start + 7k days (§2)", () => {
    it("mid-week today lands on the next grid point (2026-07-01 anchor, today 2026-08-06 → 2026-08-12)", () => {
      expect(nextRenewalDate("2026-07-01", "weekly", null, "2026-08-06")).toBe("2026-08-12");
    });

    it("long-lived anchor years back (2020-02-29 anchor, today 2026-08-09 → 2026-08-15)", () => {
      expect(nextRenewalDate("2020-02-29", "weekly", null, "2026-08-09")).toBe("2026-08-15");
    });
  });

  describe("year boundaries", () => {
    it("December wrap: monthly start 2026-12-31, today 2027-01-01 → 2027-01-31", () => {
      expect(nextRenewalDate("2026-12-31", "monthly", null, "2027-01-01")).toBe("2027-01-31");
    });

    it("multi-year custom-18: start 2025-06-30 → 2026-12-30 → 2028-06-30", () => {
      expect(nextRenewalDate("2025-06-30", "custom", 18, "2026-12-01")).toBe("2026-12-30");
      expect(nextRenewalDate("2025-06-30", "custom", 18, "2027-01-01")).toBe("2028-06-30");
    });
  });

  describe("F1 regression: two-digit years are taken literally (impl-review F1, fixed in 815b17c)", () => {
    it("weekly anchor 0099-01-01, today 2026-08-08 → 2026-08-13 (Date.UTC year remap produced 2026-08-14)", () => {
      expect(nextRenewalDate("0099-01-01", "weekly", null, "2026-08-08")).toBe("2026-08-13");
    });

    it("monthly anchor 0026-01-31 clamps in its own century (0026 is not a leap year)", () => {
      expect(nextRenewalDate("0026-01-31", "monthly", null, "0026-02-01")).toBe("0026-02-28");
    });

    it("monthly anchor 0026-01-31 stays day-31-anchored across 20 centuries", () => {
      expect(nextRenewalDate("0026-01-31", "monthly", null, "2026-08-08")).toBe("2026-08-31");
    });
  });

  describe("invalid inputs throw", () => {
    it.each(["2026-02-30", "2026-13-01", "26-01-01", ""])("start date %j", (startDate) => {
      expect(() => nextRenewalDate(startDate, "monthly", null, "2026-08-08")).toThrow(/invalid/);
    });

    it("invalid today", () => {
      expect(() => nextRenewalDate("2026-01-01", "monthly", null, "2026-02-30")).toThrow(/invalid/);
    });

    it("custom cycle with null interval", () => {
      expect(() => nextRenewalDate("2026-01-01", "custom", null, "2026-08-08")).toThrow(/positive integer interval/);
    });
  });
});

describe("summarizeActive (Business Logic §3)", () => {
  it("empty input → []", () => {
    expect(summarizeActive([])).toEqual([]);
  });

  it("excludes paused and cancelled subscriptions", () => {
    const totals = summarizeActive([
      sub({ amount: 43, status: "active" }),
      sub({ amount: 99, status: "paused" }),
      sub({ amount: 77, status: "cancelled" }),
    ]);
    expect(totals).toEqual([{ currency: "PLN", monthly: 43, yearly: 43 * 12 }]);
  });

  it("groups per currency without conversion, sorted by currency code", () => {
    const totals = summarizeActive([
      sub({ amount: 10, currency: "USD" }),
      sub({ amount: 43, currency: "PLN" }),
      sub({ amount: 5, currency: "EUR" }),
      sub({ amount: 7, currency: "PLN" }),
    ]);
    expect(totals).toEqual([
      { currency: "EUR", monthly: 5, yearly: 5 * 12 },
      { currency: "PLN", monthly: 43 + 7, yearly: (43 + 7) * 12 },
      { currency: "USD", monthly: 10, yearly: 10 * 12 },
    ]);
  });

  it("sums are unrounded sums of normalized values (weekly + yearly mix)", () => {
    const totals = summarizeActive([
      sub({ amount: 43, billing_cycle: "weekly" }),
      sub({ amount: 516, billing_cycle: "yearly" }),
    ]);
    expect(totals).toEqual([{ currency: "PLN", monthly: (43 * 52) / 12 + 516 / 12, yearly: 43 * 52 + 516 }]);
  });

  it("custom-cycle subscription contributes amount / N to the monthly total", () => {
    const totals = summarizeActive([sub({ amount: 90, billing_cycle: "custom", billing_interval_months: 18 })]);
    expect(totals).toEqual([{ currency: "PLN", monthly: 90 / 18, yearly: (90 * 12) / 18 }]);
  });
});

describe("upcomingRenewals (Business Logic §4 / FR-013)", () => {
  // Window fixtures use today 2026-08-08; the inclusive upper bound is
  // 2026-09-07 (30 days out) and 2026-09-08 is day 31 — just outside.
  const TODAY = "2026-08-08";

  it("empty input → []", () => {
    expect(upcomingRenewals([], TODAY)).toEqual([]);
  });

  it("renewal exactly on today is included (lower bound inclusive)", () => {
    const s = sub({ start_date: "2026-07-08" }); // monthly → renews 2026-08-08
    expect(upcomingRenewals([s], TODAY)).toEqual([{ subscription: s, renewalDate: "2026-08-08" }]);
  });

  it("renewal exactly on today + 30 is included (upper bound inclusive: 2026-09-07)", () => {
    const s = sub({ start_date: "2026-08-07" }); // monthly → renews 2026-09-07
    expect(upcomingRenewals([s], TODAY)).toEqual([{ subscription: s, renewalDate: "2026-09-07" }]);
  });

  it("renewal on day 31 is excluded (yearly 2025-09-08 → 2026-09-08)", () => {
    expect(upcomingRenewals([sub({ start_date: "2025-09-08", billing_cycle: "yearly" })], TODAY)).toEqual([]);
  });

  it("window end is calendar-exact across a 28-day February (today 2026-01-31 → end 2026-03-02)", () => {
    const inside = sub({ start_date: "2026-03-02" }); // future start = own renewal (k = 0)
    const outside = sub({ start_date: "2026-03-03" });
    expect(upcomingRenewals([inside, outside], "2026-01-31")).toEqual([
      { subscription: inside, renewalDate: "2026-03-02" },
    ]);
  });

  it("paused and cancelled are excluded even when renewing inside the window (§3/§4 active-only rule)", () => {
    const active = sub({ start_date: "2026-07-10" }); // → 2026-08-10
    const paused = sub({ start_date: "2026-07-09", status: "paused" });
    const cancelled = sub({ start_date: "2026-07-11", status: "cancelled" });
    expect(upcomingRenewals([paused, active, cancelled], TODAY)).toEqual([
      { subscription: active, renewalDate: "2026-08-10" },
    ]);
  });

  it("future start date inside the window is its own next renewal (§2 k = 0)", () => {
    const s = sub({ start_date: "2026-08-20", billing_cycle: "yearly" });
    expect(upcomingRenewals([s], TODAY)).toEqual([{ subscription: s, renewalDate: "2026-08-20" }]);
  });

  it("sorted soonest first across mixed cycles", () => {
    const yearly = sub({ start_date: "2025-09-05", billing_cycle: "yearly" }); // → 2026-09-05
    const weekly = sub({ start_date: "2026-08-06", billing_cycle: "weekly" }); // → 2026-08-13
    const monthly = sub({ start_date: "2026-07-10" }); // → 2026-08-10
    expect(upcomingRenewals([yearly, weekly, monthly], TODAY)).toEqual([
      { subscription: monthly, renewalDate: "2026-08-10" },
      { subscription: weekly, renewalDate: "2026-08-13" },
      { subscription: yearly, renewalDate: "2026-09-05" },
    ]);
  });

  it("stable ordering: same-day renewals keep input order", () => {
    const first = sub({ name: "First", start_date: "2026-07-20" }); // → 2026-08-20
    const second = sub({ name: "Second", start_date: "2026-07-20" }); // → 2026-08-20
    expect(upcomingRenewals([first, second], TODAY).map((u) => u.subscription.name)).toEqual(["First", "Second"]);
    expect(upcomingRenewals([second, first], TODAY).map((u) => u.subscription.name)).toEqual(["Second", "First"]);
  });

  it("invalid today throws even with an empty list (validate-first, like nextRenewalDate)", () => {
    expect(() => upcomingRenewals([], "2026-02-30")).toThrow(/invalid/);
    expect(() => upcomingRenewals([], "")).toThrow(/invalid/);
  });
});
