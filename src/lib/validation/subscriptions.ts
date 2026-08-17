import { z } from "zod";
import type { CreateSubscriptionInput, UpdateSubscriptionInput } from "@/types";

// Single source of truth for subscription input validation, shared by the API
// route (server) and the add form (client pre-validation). Mirrors every DB
// CHECK on public.subscriptions so constraint violations surface as friendly
// field errors — the database layer is a backstop, not the UX.
//
// This module must stay client-safe: the form island bundles it, so no
// server-only imports — only zod plus type-only imports from @/types.
//
// Issue messages are i18n MessageKeys (see @/lib/i18n), not English text:
// the form translates them at render time (`isMessageKey(m) ? t(m) : m`),
// and API 400 bodies carry the same keys so server-rejected input reads the
// same in both languages.

export const BILLING_CYCLES = ["weekly", "monthly", "yearly", "custom"] as const;
export const SUBSCRIPTION_CATEGORIES = ["Streaming", "Software", "Health & Fitness", "News & Media", "Other"] as const;
export const SUBSCRIPTION_STATUSES = ["active", "paused", "cancelled"] as const;

/** Real-calendar-date check for `YYYY-MM-DD` strings (rejects 2026-02-30). */
function isRealCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return false;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1) {
    return false;
  }
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const monthLengths = [31, isLeap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= monthLengths[month - 1];
}

const nameSchema = z.string("v.nameRequired").trim().min(1, "v.nameRequired").max(120, "v.nameMax");

const amountSchema = z
  .number("v.amountNumber") // z.number() rejects NaN/Infinity by itself in zod v4
  .positive("v.amountPositive")
  .lt(1e10, "v.amountMax")
  .refine((value) => Math.round(value * 100) / 100 === value, "v.amountDecimals");

const currencySchema = z
  .string("v.currencyRequired")
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, "v.currencyFormat");

const billingCycleSchema = z.enum(BILLING_CYCLES, "f.cycle.placeholder");

const billingIntervalSchema = z
  .number("v.intervalNumber")
  .int("v.intervalInt")
  .min(1, "v.intervalRange")
  .max(120, "v.intervalRange");

const startDateSchema = z
  .string("v.startRequired")
  .regex(/^\d{4}-\d{2}-\d{2}$/, "v.startFormat")
  .refine(isRealCalendarDate, "v.startReal");

const categorySchema = z.enum(SUBSCRIPTION_CATEGORIES, "f.category.placeholder");

const statusSchema = z.enum(SUBSCRIPTION_STATUSES, "f.status.placeholder");

const noteSchema = z
  .string()
  .max(500, "v.noteMax")
  .nullish()
  .transform((value) => {
    const trimmed = value?.trim();
    return trimmed ? value : null;
  });

export const subscriptionCreateSchema = z
  .object({
    name: nameSchema,
    amount: amountSchema,
    currency: currencySchema,
    billing_cycle: billingCycleSchema,
    billing_interval_months: billingIntervalSchema.nullish(),
    start_date: startDateSchema,
    category: categorySchema,
    status: statusSchema.default("active"),
    note: noteSchema,
  })
  .transform((data, ctx) => {
    // DB pair-CHECK: (billing_cycle = 'custom') = (billing_interval_months is not null).
    // Custom requires a valid interval; any other cycle normalizes a stale
    // interval to null (e.g. user picked custom, typed 3, switched to monthly).
    if (data.billing_cycle === "custom") {
      const interval = data.billing_interval_months;
      if (interval === null || interval === undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["billing_interval_months"],
          message: "v.intervalCustomRequired",
        });
        return z.NEVER;
      }
      return { ...data, billing_interval_months: interval };
    }
    return { ...data, billing_interval_months: null };
  });

export type SubscriptionCreateInput = z.input<typeof subscriptionCreateSchema>;
export type SubscriptionCreateOutput = z.output<typeof subscriptionCreateSchema>;

// Compile-time guard: the schema output must stay assignable to the service's
// input type — schema drift against the generated DB types fails `npm run lint`.
type AssertAssignable<Target, Source extends Target> = Source;
type _CreateOutputAssignable = AssertAssignable<CreateSubscriptionInput, SubscriptionCreateOutput>;

// Update schema (no consumer until S-03; defined here so the F-01 impl-review
// F2 guard — reject an empty patch that PostgREST would answer with `200 []` —
// cannot be forgotten when the PATCH route arrives).
export const subscriptionUpdateSchema = z
  .object({
    name: nameSchema,
    amount: amountSchema,
    currency: currencySchema,
    billing_cycle: billingCycleSchema,
    billing_interval_months: billingIntervalSchema.nullable(),
    start_date: startDateSchema,
    category: categorySchema,
    status: statusSchema,
    note: noteSchema,
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "v.updateEmpty",
  })
  .superRefine((data, ctx) => {
    // The DB pair-CHECK must stay satisfiable without reading current state:
    // cycle and interval are patched together, consistently.
    const hasCycle = data.billing_cycle !== undefined;
    const hasInterval = data.billing_interval_months !== undefined;
    if (hasCycle !== hasInterval) {
      ctx.addIssue({
        code: "custom",
        path: [hasCycle ? "billing_interval_months" : "billing_cycle"],
        message: "v.cyclePairTogether",
      });
      return;
    }
    if (!hasCycle) {
      return;
    }
    if (data.billing_cycle === "custom" && data.billing_interval_months === null) {
      ctx.addIssue({
        code: "custom",
        path: ["billing_interval_months"],
        message: "v.intervalCustomRequired",
      });
    } else if (data.billing_cycle !== "custom" && data.billing_interval_months !== null) {
      ctx.addIssue({
        code: "custom",
        path: ["billing_interval_months"],
        message: "v.intervalOnlyCustom",
      });
    }
  });

export type SubscriptionUpdateOutput = z.output<typeof subscriptionUpdateSchema>;
type _UpdateOutputAssignable = AssertAssignable<UpdateSubscriptionInput, SubscriptionUpdateOutput>;
