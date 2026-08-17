// Contract tests for subscriptionUpdateSchema, pinned now that S-03 gives it
// its first consumer (PATCH /api/subscriptions/[id]). The empty-patch guard is
// the F-01 impl-review F2 handoff: PostgREST answers an empty PATCH with
// `200 []`, which updateSubscription would misreport as not-found — the schema
// must reject it before it reaches the wire. The pair rules keep the DB CHECK
// `(billing_cycle = 'custom') = (billing_interval_months is not null)`
// satisfiable without reading current row state.
import { describe, expect, it } from "vitest";
import { subscriptionUpdateSchema } from "@/lib/validation/subscriptions";

/** Flattened messages for a failed parse (empty array when parse succeeds). */
function messages(input: unknown): string[] {
  const result = subscriptionUpdateSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
}

describe("subscriptionUpdateSchema — empty-patch guard (F-01 review F2)", () => {
  it("rejects {} with the non-empty message", () => {
    expect(messages({})).toContain("v.updateEmpty");
  });

  it("rejects a payload of only unknown keys (zod strips them before the refine)", () => {
    // Load-bearing: without stripping-then-refining, {"id": …} would pass the
    // guard and PostgREST would still receive an empty patch.
    expect(messages({ id: "00000000-0000-4000-8000-000000000001", user_id: "x" })).toContain("v.updateEmpty");
  });

  it("accepts a single-field patch", () => {
    const result = subscriptionUpdateSchema.safeParse({ name: "Renamed" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ name: "Renamed" });
    }
  });
});

describe("subscriptionUpdateSchema — cycle/interval pair rules", () => {
  it("rejects billing_cycle without billing_interval_months", () => {
    expect(messages({ billing_cycle: "custom" })).toContain("v.cyclePairTogether");
  });

  it("rejects billing_interval_months without billing_cycle", () => {
    expect(messages({ billing_interval_months: 3 })).toContain("v.cyclePairTogether");
  });

  it("rejects custom cycle with a null interval", () => {
    expect(messages({ billing_cycle: "custom", billing_interval_months: null })).toContain("v.intervalCustomRequired");
  });

  it("rejects a non-custom cycle with a numeric interval", () => {
    expect(messages({ billing_cycle: "monthly", billing_interval_months: 3 })).toContain("v.intervalOnlyCustom");
  });

  it("accepts custom cycle with a valid interval", () => {
    expect(subscriptionUpdateSchema.safeParse({ billing_cycle: "custom", billing_interval_months: 3 }).success).toBe(
      true,
    );
  });

  it("accepts a non-custom cycle with a null interval", () => {
    expect(subscriptionUpdateSchema.safeParse({ billing_cycle: "yearly", billing_interval_months: null }).success).toBe(
      true,
    );
  });
});

describe("subscriptionUpdateSchema — full-field payload (the edit form's shape)", () => {
  it("accepts the complete field set as sent by SubscriptionForm", () => {
    const result = subscriptionUpdateSchema.safeParse({
      name: "Netflix",
      amount: 43,
      currency: "PLN",
      billing_cycle: "monthly",
      billing_interval_months: null,
      start_date: "2026-07-15",
      category: "Streaming",
      status: "active",
      note: null,
    });
    expect(result.success).toBe(true);
  });

  it("still applies per-field rules on a partial patch", () => {
    expect(messages({ amount: -1 })).toContain("v.amountPositive");
    expect(messages({ start_date: "2026-02-30" })).toContain("v.startReal");
  });
});
