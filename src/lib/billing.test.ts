import { describe, expect, it } from "vitest";
import { nextRenewalDate } from "@/lib/billing";

describe("nextRenewalDate", () => {
  it("US-01: monthly start 2026-07-15, today 2026-08-01 → 2026-08-15", () => {
    expect(nextRenewalDate("2026-07-15", "monthly", null, "2026-08-01")).toBe("2026-08-15");
  });
});
