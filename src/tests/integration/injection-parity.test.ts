import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cleanupTestUsers, createTestUser, validSubscription, type TestUser } from "./helpers";

// Test-plan §2 risk #5 (untrusted input) — parity proof: the DB CHECK
// constraints hold INDEPENDENTLY of zod. These payloads go straight at
// PostgREST as an authenticated user, bypassing the API routes and their
// schemas entirely (the anti-pattern to avoid was "testing the schema in
// isolation only"; the mirror-image trap is trusting zod as the only net —
// any non-zod path (a future endpoint, Studio, a bug) must still be caught
// by the database).
//
// Oracles: constraint violations surface as PostgREST error code 23514
// (check_violation) naming the constraint from
// supabase/migrations/20260808210821_create_subscriptions.sql; a
// script-tag name is data, not code — stored and returned byte-identical,
// never evaluated (render-inertness is React/Astro escaping, e2e's job).

/** Postgres check_violation, surfaced by PostgREST. */
const CHECK_VIOLATION = "23514";

describe("subscriptions injection/validation parity (DB CHECKs without zod)", () => {
  let user: TestUser;

  beforeAll(async () => {
    user = await createTestUser();
  });

  afterAll(async () => {
    await cleanupTestUsers();
  });

  it("a script-tag name is stored as an inert literal, byte-identical on read-back", async () => {
    const payload = '<script>alert("xss")</script>';
    const inserted = await user.client
      .from("subscriptions")
      .insert(validSubscription({ name: payload }))
      .select()
      .single();
    expect(inserted.error).toBeNull();
    expect(inserted.data?.name).toBe(payload);

    const readBack = await user.client
      .from("subscriptions")
      .select("name")
      .eq("id", inserted.data?.id ?? "")
      .single();
    expect(readBack.data?.name).toBe(payload); // literal survived the round-trip unmodified
  });

  it("negative amount violates subscriptions_amount_check", async () => {
    const { error } = await user.client.from("subscriptions").insert(validSubscription({ amount: -5 }));
    expect(error?.code).toBe(CHECK_VIOLATION);
    expect(error?.message).toContain("subscriptions_amount_check");
  });

  it("non-custom cycle with an interval violates subscriptions_cycle_interval_check", async () => {
    const { error } = await user.client
      .from("subscriptions")
      .insert(validSubscription({ billing_cycle: "monthly", billing_interval_months: 3 }));
    expect(error?.code).toBe(CHECK_VIOLATION);
    expect(error?.message).toContain("subscriptions_cycle_interval_check");
  });

  it("custom cycle without an interval violates subscriptions_cycle_interval_check", async () => {
    const { error } = await user.client
      .from("subscriptions")
      .insert(validSubscription({ billing_cycle: "custom", billing_interval_months: null }));
    expect(error?.code).toBe(CHECK_VIOLATION);
    expect(error?.message).toContain("subscriptions_cycle_interval_check");
  });

  it("oversized note (501 chars) violates subscriptions_note_check", async () => {
    const { error } = await user.client.from("subscriptions").insert(validSubscription({ note: "x".repeat(501) }));
    expect(error?.code).toBe(CHECK_VIOLATION);
    expect(error?.message).toContain("subscriptions_note_check");
  });

  it("oversized name (121 chars) violates subscriptions_name_check", async () => {
    const { error } = await user.client.from("subscriptions").insert(validSubscription({ name: "x".repeat(121) }));
    expect(error?.code).toBe(CHECK_VIOLATION);
    expect(error?.message).toContain("subscriptions_name_check");
  });
});
