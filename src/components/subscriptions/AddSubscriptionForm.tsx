import React, { useState } from "react";
import { z } from "zod";
import { cn } from "@/lib/utils";
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

// FR-004 add-subscription form. Follows the SignInForm island pattern
// (controlled fields, client pre-validation, noValidate) but posts JSON to
// POST /api/subscriptions and renders zod field errors in place — client and
// server share subscriptionCreateSchema, one source of truth for both sides
// of the wire. On 201 it does a full navigation to /dashboard so totals are
// always SSR-computed fresh (no stale aggregates).

type FieldErrors = Record<string, string[] | undefined>;

interface ErrorPayload {
  errors?: { formErrors?: string[]; fieldErrors?: FieldErrors };
  error?: string;
}

const CYCLE_LABELS: Record<(typeof BILLING_CYCLES)[number], string> = {
  weekly: "Weekly",
  monthly: "Monthly",
  yearly: "Yearly",
  custom: "Custom (every N months)",
};

export default function AddSubscriptionForm() {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("PLN");
  const [billingCycle, setBillingCycle] = useState<string>("monthly");
  const [intervalMonths, setIntervalMonths] = useState("");
  const [startDate, setStartDate] = useState("");
  const [category, setCategory] = useState<string>("");
  const [status, setStatus] = useState<string>("active");
  const [note, setNote] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

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

  async function handleSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
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
      const response = await fetch("/api/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });

      if (response.status === 201) {
        window.location.assign("/dashboard");
        return;
      }
      if (response.status === 401) {
        window.location.assign("/auth/signin");
        return;
      }
      if (response.status === 400) {
        const data = (await response.json()) as ErrorPayload;
        setFieldErrors(data.errors?.fieldErrors ?? {});
        setFormErrors(
          data.errors?.formErrors?.length ? data.errors.formErrors : data.error ? [data.error] : ["Invalid input."],
        );
        return;
      }
      setFormErrors(["Something went wrong while saving. Please try again."]);
    } catch {
      setFormErrors(["Could not reach the server. Please try again."]);
    } finally {
      setSubmitting(false);
    }
  }

  function fieldError(field: string): string | undefined {
    return fieldErrors[field]?.[0];
  }

  return (
    <form
      onSubmit={(e) => {
        void handleSubmit(e);
      }}
      noValidate
      className="space-y-4"
    >
      <Field id="name" label="Name" error={fieldError("name")}>
        <Input
          id="name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            clearFieldError("name");
          }}
          placeholder="Netflix"
          aria-invalid={Boolean(fieldError("name"))}
        />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field id="amount" label="Amount" error={fieldError("amount")}>
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

        <Field id="currency" label="Currency" error={fieldError("currency")}>
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
        <Field id="billing_cycle" label="Billing cycle" error={fieldError("billing_cycle")}>
          <Select
            value={billingCycle}
            onValueChange={(value) => {
              setBillingCycle(value);
              clearFieldError("billing_cycle");
              clearFieldError("billing_interval_months");
            }}
          >
            <SelectTrigger id="billing_cycle" className="w-full" aria-invalid={Boolean(fieldError("billing_cycle"))}>
              <SelectValue placeholder="Pick a billing cycle" />
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
          <Field id="billing_interval_months" label="Every N months" error={fieldError("billing_interval_months")}>
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

      <Field id="start_date" label="Start date" error={fieldError("start_date")}>
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
        <Field id="category" label="Category" error={fieldError("category")}>
          <Select
            value={category}
            onValueChange={(value) => {
              setCategory(value);
              clearFieldError("category");
            }}
          >
            <SelectTrigger id="category" className="w-full" aria-invalid={Boolean(fieldError("category"))}>
              <SelectValue placeholder="Pick a category" />
            </SelectTrigger>
            <SelectContent>
              {SUBSCRIPTION_CATEGORIES.map((item) => (
                <SelectItem key={item} value={item}>
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field id="status" label="Status" error={fieldError("status")}>
          <Select
            value={status}
            onValueChange={(value) => {
              setStatus(value);
              clearFieldError("status");
            }}
          >
            <SelectTrigger id="status" className="w-full" aria-invalid={Boolean(fieldError("status"))}>
              <SelectValue placeholder="Pick a status" />
            </SelectTrigger>
            <SelectContent>
              {SUBSCRIPTION_STATUSES.map((item) => (
                <SelectItem key={item} value={item}>
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      <Field id="note" label="Note (optional)" error={fieldError("note")}>
        <Textarea
          id="note"
          value={note}
          maxLength={500}
          rows={3}
          onChange={(e) => {
            setNote(e.target.value);
            clearFieldError("note");
          }}
          placeholder="Family plan, shared with…"
          aria-invalid={Boolean(fieldError("note"))}
        />
      </Field>

      {formErrors.length > 0 && (
        <div
          role="alert"
          className="border-destructive/40 bg-destructive/10 text-destructive rounded-lg border px-3 py-2 text-sm"
        >
          {formErrors.map((message) => (
            <p key={message}>{message}</p>
          ))}
        </div>
      )}

      <Button type="submit" disabled={submitting} className="w-full">
        {submitting ? "Saving…" : "Add subscription"}
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
