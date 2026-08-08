import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";
import { findDuplicateName } from "@/lib/duplicates";
import { listSubscriptionNames } from "@/lib/services/subscriptions";

// GET /api/subscriptions/duplicate-check?name=…[&exclude=<uuid>] — the FR-014
// advisory read path (S-07). Answers whether the normalized candidate name
// matches one of the caller's existing subscriptions; `exclude` skips the row
// being edited so an unchanged name never self-matches in the rename flow.
// Deliberately a separate read-only route: the save endpoints (POST/PATCH)
// stay untouched, so a duplicate warning can never block a save. Sibling
// conventions apply — middleware sets locals.user but does not redirect API
// routes, so this endpoint owns its 401; RLS scopes the read to the caller.
// This static route wins over the dynamic sibling [id].ts, which has no GET.

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const nameParamSchema = z.string().min(1);
const excludeParamSchema = z.uuid();

export const GET: APIRoute = async (context) => {
  if (!context.locals.user) {
    return json({ error: "Authentication required" }, 401);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return json({ error: "Supabase is not configured" }, 500);
  }

  const params = context.url.searchParams;
  const name = nameParamSchema.safeParse(params.get("name"));
  if (!name.success) {
    return json({ error: 'Query parameter "name" is required' }, 400);
  }
  const excludeRaw = params.get("exclude");
  const exclude = excludeRaw === null ? undefined : excludeParamSchema.safeParse(excludeRaw);
  if (exclude && !exclude.success) {
    return json({ error: 'Query parameter "exclude" must be a uuid' }, 400);
  }

  try {
    const rows = await listSubscriptionNames(supabase);
    const match = findDuplicateName(name.data, rows, exclude?.data);
    return json({ duplicate: match !== null, match }, 200);
  } catch {
    // DB details stay server-side, matching the sibling routes.
    return json({ error: "Could not check for duplicates" }, 500);
  }
};
