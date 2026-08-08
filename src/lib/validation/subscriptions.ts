import { z } from "zod";
import type { CreateSubscriptionInput, UpdateSubscriptionInput } from "@/types";

// Single source of truth for subscription input validation, shared by the API
// route (server) and the add form (client pre-validation). Mirrors every DB
// CHECK on public.subscriptions so constraint violations surface as friendly
// field errors — the database layer is a backstop, not the UX.
//
// This module must stay client-safe: the form island bundles it, so no
// server-only imports — only zod plus type-only imports from @/types.

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

const nameSchema = z
  .string("Name is required")
  .trim()
  .min(1, "Name is required")
  .max(120, "Name must be at most 120 characters");

const amountSchema = z
  .number("Amount must be a number") // z.number() rejects NaN/Infinity by itself in zod v4
  .positive("Amount must be greater than 0")
  .lt(1e10, "Amount is too large")
  .refine((value) => Math.round(value * 100) / 100 === value, "Amount can have at most 2 decimal places");

const currencySchema = z
  .string("Currency is required")
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, "Currency must be a 3-letter ISO code (e.g. PLN)");

const billingCycleSchema = z.enum(BILLING_CYCLES, "Pick a billing cycle");

const billingIntervalSchema = z
  .number("Interval must be a number of months")
  .int("Interval must be a whole number of months")
  .min(1, "Interval must be between 1 and 120 months")
  .max(120, "Interval must be between 1 and 120 months");

const startDateSchema = z
  .string("Start date is required")
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Start date must be YYYY-MM-DD")
  .refine(isRealCalendarDate, "Start date must be a real calendar date");

const categorySchema = z.enum(SUBSCRIPTION_CATEGORIES, "Pick a category");

const statusSchema = z.enum(SUBSCRIPTION_STATUSES, "Pick a status");

const noteSchema = z
  .string()
  .max(500, "Note must be at most 500 characters")
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
          message: "Interval in months is required for a custom cycle",
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
    message: "Provide at least one field to update",
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
        message: "billing_cycle and billing_interval_months must be updated together",
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
        message: "Interval in months is required for a custom cycle",
      });
    } else if (data.billing_cycle !== "custom" && data.billing_interval_months !== null) {
      ctx.addIssue({
        code: "custom",
        path: ["billing_interval_months"],
        message: "Interval in months applies only to a custom cycle",
      });
    }
  });

export type SubscriptionUpdateOutput = z.output<typeof subscriptionUpdateSchema>;
type _UpdateOutputAssignable = AssertAssignable<UpdateSubscriptionInput, SubscriptionUpdateOutput>;
