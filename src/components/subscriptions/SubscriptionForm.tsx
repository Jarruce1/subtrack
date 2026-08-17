import React, { useRef, useState } from "react";
import { z } from "zod";
import { cn } from "@/lib/utils";
import { normalizeName } from "@/lib/duplicates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  BILLING_CYCLES,
  SUBSCRIPTION_CATEGORIES,
  SUBSCRIPTION_STATUSES,
  subscriptionCreateSchema,
} from "@/lib/validation/subscriptions";
import { categoryLabel, isMessageKey, statusLabel, translator, type Lang } from "@/lib/i18n";
import type { Subscription } from "@/types";

// FR-004/FR-006 subscription form, dual-mode (S-03 generalization of the S-01
// add form; field markup, validation wiring, and error rendering are shared).
// A `subscription` prop switches to edit mode: state prefills from the row and
// submit PATCHes the item route with the FULL field set — always non-empty and
// cycle/interval-consistent, so it satisfies subscriptionUpdateSchema's guards
// while partial PATCH remains a valid API contract for other clients. Client
// and server share the create schema for pre-validation (its output shape is a
// valid update payload — normalizes stale intervals to null). On success both
// modes do a full navigation (add → /dashboard, edit → /subscriptions) so the
// next render is fresh SSR (no stale aggregates).

type FieldErrors = Record<string, string[] | undefined>;

interface ErrorPayload {
  errors?: { formErrors?: string[]; fieldErrors?: FieldErrors };
  error?: string;
}

interface SubscriptionFormProps {
  /** Row to edit; omit for add mode. */
  subscription?: Subscription;
  lang?: Lang;
}

export default function SubscriptionForm({ subscription, lang = "en" }: SubscriptionFormProps) {
  const isEdit = subscription !== undefined;
  const t = translator(lang);
  const CYCLE_LABELS: Record<(typeof BILLING_CYCLES)[number], string> = {
    weekly: t("cycle.weekly"),
    monthly: t("cycle.monthly"),
    yearly: t("cycle.yearly"),
    custom: t("cycle.custom"),
  };

  const [name, setName] = useState(subscription?.name ?? "");
  const [amount, setAmount] = useState(subscription ? String(subscription.amount) : "");
  const [currency, setCurrency] = useState(subscription?.currency ?? "PLN");
  const [billingCycle, setBillingCycle] = useState<string>(subscription?.billing_cycle ?? "monthly");
  const [intervalMonths, setIntervalMonths] = useState(
    subscription?.billing_interval_months != null ? String(subscription.billing_interval_months) : "",
  );
  const [startDate, setStartDate] = useState(subscription?.start_date ?? "");
  const [category, setCategory] = useState<string>(subscription?.category ?? "");
  const [status, setStatus] = useState<string>(subscription?.status ?? "active");
  const [note, setNote] = useState(subscription?.note ?? "");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  // FR-014 advisory duplicate warning (S-07). `duplicateWarning` holds the
  // matched stored name; the ref remembers the normalized name the user has
  // already been warned about, so resubmitting it saves anyway ("the warning
  // never blocks saving" — US-03), while editing to a different name re-arms
  // the check.
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const acknowledgedNameRef = useRef<string | null>(null);

  function clearFieldError(field: string) {
    setFieldErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));
  }

  function buildPayload(): unknown {
    return {
      name,
      amount: amount.trim() === "" ? undefined : Number(amount),
      currency,
      billing_cycle: billingCycle === "" ? undefined : billingCycle,
      billing_interval_months:
        billingCycle === "custom" ? (intervalMonths.trim() === "" ? undefined : Number(intervalMonths)) : null,
      start_date: startDate === "" ? undefined : startDate,
      category: category === "" ? undefined : category,
      status,
      note: note === "" ? null : note,
    };
  }

  /**
   * Advisory FR-014 check. Resolves to the matched existing subscription, or
   * null. Fail-open by contract: any non-200 answer, network error, or parse
   * error resolves to null so the save proceeds — the check must never be
   * able to block a save.
   */
  async function checkDuplicate(candidateName: string): Promise<{ id: string; name: string } | null> {
    try {
      const query = new URLSearchParams({ name: candidateName });
      if (subscription) {
        query.set("exclude", subscription.id);
      }
      // Bounded wait: a hung advisory check must not hold the save hostage —
      // the abort lands in the catch below and resolves fail-open.
      const response = await fetch(`/api/subscriptions/duplicate-check?${query.toString()}`, {
        signal: AbortSignal.timeout(2000),
      });
      if (response.status !== 200) {
        return null;
      }
      const data = (await response.json()) as { duplicate?: boolean; match?: { id: string; name: string } | null };
      return data.duplicate && data.match ? data.match : null;
    } catch {
      return null;
    }
  }

  async function handleSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) {
      return; // belt-and-braces double-submit guard alongside the disabled button
    }
    setFormErrors([]);

    const parsed = subscriptionCreateSchema.safeParse(buildPayload());
    if (!parsed.success) {
      const flat = z.flattenError(parsed.error);
      setFieldErrors(flat.fieldErrors);
      setFormErrors(flat.formErrors);
      return;
    }

    setFieldErrors({});
    setSubmitting(true);
    try {
      // Duplicate check runs once per candidate name, before the save fetch.
      // Skipped when the name was already acknowledged (resubmit = "Save
      // anyway") and when an edit keeps the row's own name (not a rename).
      const candidate = normalizeName(parsed.data.name);
      const isOwnUnchangedName = subscription !== undefined && candidate === normalizeName(subscription.name);
      if (candidate !== acknowledgedNameRef.current && !isOwnUnchangedName) {
        const match = await checkDuplicate(parsed.data.name);
        if (match) {
          acknowledgedNameRef.current = candidate;
          setDuplicateWarning(match.name);
          return;
        }
      }
      setDuplicateWarning(null);
      const response = await fetch(isEdit ? `/api/subscriptions/${subscription.id}` : "/api/subscriptions", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });

      if (response.status === (isEdit ? 200 : 201)) {
        window.location.assign(isEdit ? "/subscriptions" : "/dashboard");
        return;
      }
      if (response.status === 401) {
        window.location.assign("/auth/signin");
        return;
      }
      if (isEdit && response.status === 404) {
        setFormErrors([t("f.err.gone")]);
        return;
      }
      if (response.status === 400) {
        const data = (await response.json()) as ErrorPayload;
        setFieldErrors(data.errors?.fieldErrors ?? {});
        setFormErrors(
          data.errors?.formErrors?.length ? data.errors.formErrors : data.error ? [data.error] : [t("f.err.invalid")],
        );
        return;
      }
      setFormErrors([t("f.err.save")]);
    } catch {
      setFormErrors([t("f.err.network")]);
    } finally {
      setSubmitting(false);
    }
  }

  // Schema issues (client parse AND server 400 bodies) carry i18n keys;
  // anything else (e.g. a raw server "error" string) passes through as-is.
  function trMessage(message: string): string {
    return isMessageKey(message) ? t(message) : message;
  }

  function fieldError(field: string): string | undefined {
    const message = fieldErrors[field]?.[0];
    return message === undefined ? undefined : trMessage(message);
  }

  return (
    <form
      onSubmit={(e) => {
        void handleSubmit(e);
      }}
      noValidate
      className="space-y-4"
    >
      <Field id="name" label={t("f.name")} error={fieldError("name")}>
        <Input
          id="name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            clearFieldError("name");
            // Editing the name invalidates the shown warning; the
            // acknowledged marker stays, so resubmitting the identical
            // name still saves without re-warning.
            setDuplicateWarning(null);
          }}
          placeholder="Netflix"
          aria-invalid={Boolean(fieldError("name"))}
        />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field id="amount" label={t("f.amount")} error={fieldError("amount")}>
          <Input
            id="amount"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              clearFieldError("amount");
            }}
            placeholder="43.00"
            aria-invalid={Boolean(fieldError("amount"))}
          />
        </Field>

        <Field id="currency" label={t("f.currency")} error={fieldError("currency")}>
          <Input
            id="currency"
            value={currency}
            maxLength={3}
            onChange={(e) => {
              setCurrency(e.target.value.toUpperCase());
              clearFieldError("currency");
            }}
            placeholder="PLN"
            aria-invalid={Boolean(fieldError("currency"))}
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field id="billing_cycle" label={t("f.cycle")} error={fieldError("billing_cycle")}>
          <Select
            value={billingCycle}
            onValueChange={(value) => {
              setBillingCycle(value);
              clearFieldError("billing_cycle");
              clearFieldError("billing_interval_months");
            }}
          >
            <SelectTrigger id="billing_cycle" className="w-full" aria-invalid={Boolean(fieldError("billing_cycle"))}>
              <SelectValue placeholder={t("f.cycle.placeholder")} />
            </SelectTrigger>
            <SelectContent>
              {BILLING_CYCLES.map((cycle) => (
                <SelectItem key={cycle} value={cycle}>
                  {CYCLE_LABELS[cycle]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        {billingCycle === "custom" && (
          <Field id="billing_interval_months" label={t("f.interval")} error={fieldError("billing_interval_months")}>
            <Input
              id="billing_interval_months"
              type="number"
              inputMode="numeric"
              min="1"
              max="120"
              step="1"
              required
              value={intervalMonths}
              onChange={(e) => {
                setIntervalMonths(e.target.value);
                clearFieldError("billing_interval_months");
              }}
              placeholder="3"
              aria-invalid={Boolean(fieldError("billing_interval_months"))}
            />
          </Field>
        )}
      </div>

      <Field id="start_date" label={t("f.startDate")} error={fieldError("start_date")}>
        <Input
          id="start_date"
          type="date"
          value={startDate}
          onChange={(e) => {
            setStartDate(e.target.value);
            clearFieldError("start_date");
          }}
          aria-invalid={Boolean(fieldError("start_date"))}
        />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field id="category" label={t("f.category")} error={fieldError("category")}>
          <Select
            value={category}
            onValueChange={(value) => {
              setCategory(value);
              clearFieldError("category");
            }}
          >
            <SelectTrigger id="category" className="w-full" aria-invalid={Boolean(fieldError("category"))}>
              <SelectValue placeholder={t("f.category.placeholder")} />
            </SelectTrigger>
            <SelectContent>
              {SUBSCRIPTION_CATEGORIES.map((item) => (
                <SelectItem key={item} value={item}>
                  {categoryLabel(lang, item)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field id="status" label={t("f.status")} error={fieldError("status")}>
          <Select
            value={status}
            onValueChange={(value) => {
              setStatus(value);
              clearFieldError("status");
            }}
          >
            <SelectTrigger id="status" className="w-full" aria-invalid={Boolean(fieldError("status"))}>
              <SelectValue placeholder={t("f.status.placeholder")} />
            </SelectTrigger>
            <SelectContent>
              {SUBSCRIPTION_STATUSES.map((item) => (
                <SelectItem key={item} value={item}>
                  {statusLabel(lang, item)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      <Field id="note" label={t("f.note")} error={fieldError("note")}>
        <Textarea
          id="note"
          value={note}
          maxLength={500}
          rows={3}
          onChange={(e) => {
            setNote(e.target.value);
            clearFieldError("note");
          }}
          placeholder={t("f.note.placeholder")}
          aria-invalid={Boolean(fieldError("note"))}
        />
      </Field>

      {duplicateWarning !== null && (
        <div
          role="status"
          className="rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-sm text-amber-200"
        >
          {t("f.dup.pre")}
          {duplicateWarning}
          {t("f.dup.post")}
        </div>
      )}

      {formErrors.length > 0 && (
        <div
          role="alert"
          className="border-destructive/40 bg-destructive/10 text-destructive rounded-lg border px-3 py-2 text-sm"
        >
          {formErrors.map((message) => (
            <p key={message}>{trMessage(message)}</p>
          ))}
        </div>
      )}

      <Button type="submit" disabled={submitting} className="w-full">
        {submitting
          ? t("f.save.pending")
          : duplicateWarning !== null
            ? t("f.save.anyway")
            : isEdit
              ? t("f.save.changes")
              : t("f.save.add")}
      </Button>
    </form>
  );
}

interface FieldProps {
  id: string;
  label: string;
  error?: string;
  children: React.ReactNode;
}

function Field({ id, label, error, children }: FieldProps) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      <p className={cn("text-destructive text-sm", !error && "hidden")}>{error}</p>
    </div>
  );
}
