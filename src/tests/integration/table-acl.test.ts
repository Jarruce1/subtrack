import { describe, expect, it } from "vitest";
import { sql } from "./helpers";

// Regression net for the lessons.md burn "New tables inherit RLS-exempt
// privileges from the default ACL": the postgres 17 image's default ACL
// grants anon/authenticated/service_role TRUNCATE, REFERENCES, TRIGGER and
// MAINTAIN on every new public table — privileges RLS does NOT govern
// (TRUNCATE would be a cross-tenant wipe). Migration
// 20260808213726_revoke_subscriptions_default_privileges.sql revokes them;
// this suite pins the full privilege matrix so any future migration that
// re-grants an RLS-exempt bit (or drops RLS) fails the gate.
//
// Oracle: has_table_privilege() per role × privilege — TRUE only for
// authenticated × {SELECT, INSERT, UPDATE, DELETE}; everything else FALSE.

const ROLES = ["anon", "authenticated", "service_role"] as const;
const DML = ["SELECT", "INSERT", "UPDATE", "DELETE"] as const;
const RLS_EXEMPT = ["TRUNCATE", "REFERENCES", "TRIGGER", "MAINTAIN"] as const;

/**
 * One psql round-trip: `role:PRIVILEGE:true|false` lines for the whole matrix
 * (boolean→text casts as "true"/"false"). Invariant: the values interpolated
 * into the SQL below MUST remain the compile-time literals above — never
 * feed runtime data through this template (sql() takes a raw string).
 */
function privilegeMatrix(): Map<string, boolean> {
  const rolesList = ROLES.map((r) => `('${r}')`).join(",");
  const privsList = [...DML, ...RLS_EXEMPT].map((p) => `('${p}')`).join(",");
  const out = sql(
    `select r.rolname || ':' || p.priv || ':' || has_table_privilege(r.rolname, 'public.subscriptions', p.priv)
     from (values ${rolesList}) as r(rolname), (values ${privsList}) as p(priv)`,
  );
  const matrix = new Map<string, boolean>();
  for (const line of out.split("\n")) {
    const [role, priv, held] = line.split(":");
    matrix.set(`${role}:${priv}`, held === "true");
  }
  return matrix;
}

describe("subscriptions table ACL (lessons.md default-ACL regression)", () => {
  it("API roles hold no RLS-exempt privileges; DML is authenticated-only", () => {
    const matrix = privilegeMatrix();
    expect(matrix.size).toBe(ROLES.length * (DML.length + RLS_EXEMPT.length));

    const violations: string[] = [];
    for (const role of ROLES) {
      for (const priv of [...DML, ...RLS_EXEMPT]) {
        const expected = role === "authenticated" && (DML as readonly string[]).includes(priv);
        if (matrix.get(`${role}:${priv}`) !== expected) {
          violations.push(`${role} ${expected ? "lost" : "holds"} ${priv}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("row level security is enabled on public.subscriptions", () => {
    expect(sql("select relrowsecurity from pg_class where oid = 'public.subscriptions'::regclass")).toBe("t");
  });
});
