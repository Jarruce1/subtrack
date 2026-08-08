import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cleanupTestUsers, createAnonClient, createTestUser, validSubscription, type TestUser } from "./helpers";

// Test-plan §2 risk #2 (IDOR/isolation), §3 Phase 1. Oracle: with two REAL
// accounts on the REAL local database, B's attempts to read/update/delete
// A's rows change nothing AT THE DATABASE LEVEL — asserted by re-reading as
// the owner, not by trusting an HTTP status. Anon is denied at the
// privilege layer (no grants → Postgres 42501, not just an empty result),
// and ownership forgery on insert/update is rejected by the policies'
// WITH CHECK (42501: "new row violates row-level security policy").
//
// Requests go straight at PostgREST via @supabase/supabase-js — the exact
// enforcement path the app uses (src/lib/services/subscriptions.ts never
// passes or filters user_id; RLS does all the work).

/** Postgres "permission denied" / RLS with-check violation, surfaced by PostgREST. */
const INSUFFICIENT_PRIVILEGE = "42501";

describe("subscriptions RLS isolation (two real accounts + anon)", () => {
  let userA: TestUser;
  let userB: TestUser;
  let rowId: string;
  const originalName = "User A private subscription";

  beforeAll(async () => {
    userA = await createTestUser();
    userB = await createTestUser();
    const { data, error } = await userA.client
      .from("subscriptions")
      .insert(validSubscription({ name: originalName }))
      .select()
      .single();
    if (error) {
      throw new Error(`seed insert as user A failed: ${error.message}`);
    }
    rowId = data.id;
  });

  afterAll(async () => {
    await cleanupTestUsers();
  });

  it("owner sanity: A sees the row it created, stamped with A's user_id", async () => {
    // Guards the suite against vacuous greens: if this fails, the empty
    // results below would prove nothing.
    const { data, error } = await userA.client.from("subscriptions").select("*").eq("id", rowId).single();
    expect(error).toBeNull();
    expect(data?.name).toBe(originalName);
    expect(data?.user_id).toBe(userA.userId);
  });

  it("B cannot select A's data — list is empty and the id resolves to nothing", async () => {
    const list = await userB.client.from("subscriptions").select("*");
    expect(list.error).toBeNull();
    expect(list.data).toEqual([]);

    const byId = await userB.client.from("subscriptions").select("*").eq("id", rowId).maybeSingle();
    expect(byId.error).toBeNull();
    expect(byId.data).toBeNull();
  });

  it("B's update of A's row hits 0 rows and changes nothing at the database", async () => {
    const attempt = await userB.client.from("subscriptions").update({ name: "hijacked by B" }).eq("id", rowId).select();
    expect(attempt.error).toBeNull();
    expect(attempt.data).toEqual([]); // RLS USING filtered the row out: 0 rows updated

    const asOwner = await userA.client.from("subscriptions").select("name").eq("id", rowId).single();
    expect(asOwner.data?.name).toBe(originalName); // DB-level proof: unchanged
  });

  it("B's delete of A's row hits 0 rows and the row survives", async () => {
    const attempt = await userB.client.from("subscriptions").delete().eq("id", rowId).select("id");
    expect(attempt.error).toBeNull();
    expect(attempt.data).toEqual([]); // 0 rows deleted

    const asOwner = await userA.client.from("subscriptions").select("id").eq("id", rowId).maybeSingle();
    expect(asOwner.data?.id).toBe(rowId); // DB-level proof: still there
  });

  it("anon select is denied at the privilege layer (42501), not just empty", async () => {
    const anon = createAnonClient();
    const { data, error } = await anon.from("subscriptions").select("*");
    expect(data).toBeNull();
    expect(error?.code).toBe(INSUFFICIENT_PRIVILEGE);
  });

  it("anon insert is denied at the privilege layer (42501)", async () => {
    const anon = createAnonClient();
    const { error } = await anon.from("subscriptions").insert(validSubscription());
    expect(error?.code).toBe(INSUFFICIENT_PRIVILEGE);
  });

  it("A cannot forge user_id on insert — WITH CHECK rejects a row owned by B", async () => {
    const { error } = await userA.client
      .from("subscriptions")
      .insert(validSubscription({ name: "forged owner", user_id: userB.userId }));
    expect(error?.code).toBe(INSUFFICIENT_PRIVILEGE);

    // DB-level proof: the forged row landed nowhere B can see. Scoped to
    // this probe's name so a future test legitimately inserting as B
    // cannot turn this into a false red.
    const asB = await userB.client.from("subscriptions").select("*").eq("name", "forged owner");
    expect(asB.data).toEqual([]);
  });

  it("A cannot re-home its own row — update flipping user_id to B is rejected", async () => {
    const { error } = await userA.client
      .from("subscriptions")
      .update({ user_id: userB.userId })
      .eq("id", rowId)
      .select();
    expect(error?.code).toBe(INSUFFICIENT_PRIVILEGE);

    const asOwner = await userA.client.from("subscriptions").select("user_id").eq("id", rowId).single();
    expect(asOwner.data?.user_id).toBe(userA.userId); // DB-level proof: still A's
  });
});
