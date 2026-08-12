import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { listSubscriptions } from "@/lib/services/subscriptions";
import { nextRenewalDate, normalizeCost } from "@/lib/billing";

// GET /api/subscriptions/export — the user's own rows as CSV (RLS scopes the
// read; middleware sets locals.user but API routes own their 401). Normalized
// costs and the next renewal are derived server-side with the same billing
// functions the views use, so the export can never disagree with the UI.

const HEADER = [
  "name",
  "category",
  "status",
  "amount",
  "currency",
  "billing_cycle",
  "billing_interval_months",
  "start_date",
  "monthly_normalized",
  "yearly_normalized",
  "next_renewal",
  "note",
];

/** RFC 4180 field: always quoted, inner quotes doubled — inert in Excel too. */
function csvField(value: string | number | null): string {
  const raw = value == null ? "" : String(value);
  return `"${raw.replaceAll('"', '""')}"`;
}

export const GET: APIRoute = async (context) => {
  if (!context.locals.user) {
    return new Response(JSON.stringify({ error: "Authentication required" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return new Response(JSON.stringify({ error: "Supabase is not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const subscriptions = await listSubscriptions(supabase);
  const today = new Date().toISOString().slice(0, 10);

  const lines = [HEADER.join(",")];
  for (const subscription of subscriptions) {
    const normalized = normalizeCost(
      subscription.amount,
      subscription.billing_cycle,
      subscription.billing_interval_months,
    );
    const renewal =
      subscription.status === "active"
        ? nextRenewalDate(
            subscription.start_date,
            subscription.billing_cycle,
            subscription.billing_interval_months,
            today,
          )
        : "";
    lines.push(
      [
        csvField(subscription.name),
        csvField(subscription.category),
        csvField(subscription.status),
        csvField(subscription.amount),
        csvField(subscription.currency),
        csvField(subscription.billing_cycle),
        csvField(subscription.billing_interval_months),
        csvField(subscription.start_date),
        csvField(normalized.monthly.toFixed(2)),
        csvField(normalized.yearly.toFixed(2)),
        csvField(renewal),
        csvField(subscription.note),
      ].join(","),
    );
  }

  return new Response(lines.join("\r\n") + "\r\n", {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="subtrack-subscriptions.csv"',
      "Cache-Control": "no-store",
    },
  });
};
