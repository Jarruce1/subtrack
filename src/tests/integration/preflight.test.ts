import { describe, expect, it } from "vitest";
import { getStack, sql } from "./helpers";

// Stack preflight: every integration suite depends on these three facts.
// getStack() itself fails loudly (with a "start supabase" hint and a
// locality guard) from whichever file happens to run first — Vitest does
// not order files by name — so this file's job is to pin the stack
// contract explicitly, not to be a gatekeeper.

describe("local stack preflight", () => {
  it("supabase status yields the URLs and keys the suites need", () => {
    const stack = getStack();
    expect(stack.apiUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(stack.dbUrl).toContain("postgresql://");
    expect(stack.anonKey.length).toBeGreaterThan(0);
    expect(stack.serviceRoleKey.length).toBeGreaterThan(0);
  });

  it("postgres answers over psql", () => {
    expect(sql("select 1")).toBe("1");
  });

  it("the REST API answers over HTTP", async () => {
    const { apiUrl, anonKey } = getStack();
    const response = await fetch(`${apiUrl}/rest/v1/`, { headers: { apikey: anonKey } });
    expect(response.ok).toBe(true);
  });
});
