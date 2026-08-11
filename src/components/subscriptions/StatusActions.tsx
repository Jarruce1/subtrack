import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { statusActions } from "@/lib/lifecycle";
import { translator, type Lang, type MessageKey } from "@/lib/i18n";
import type { SubscriptionStatus } from "@/types";

// FR-008 / US-04 quick lifecycle actions on the list: pause / resume / cancel
// (confirmed) / reactivate without opening the edit form. Mirrors the
// DeleteSubscriptionButton contract — window.confirm for destructive intent,
// PATCH to the item route, then a full navigation so every SSR view (list
// badge, dashboard totals, categories, upcoming renewals) recomputes from the
// store: the established "no stale aggregates" mechanism. Both buttons in this
// island disable while a request is pending; the sibling delete island stays
// clickable (accepted harmless race — the loser answers 404 → reload).

interface StatusActionsProps {
  id: string;
  name: string;
  status: SubscriptionStatus;
  lang?: Lang;
}

// lifecycle.ts stays the single canonical (English) source of transitions;
// this map only localizes the DISPLAY of its labels.
const ACTION_LABEL_KEYS: Record<string, MessageKey> = {
  Pause: "act.pause",
  Resume: "act.resume",
  Cancel: "act.cancel",
  Reactivate: "act.reactivate",
};

export default function StatusActions({ id, name, status, lang = "en" }: StatusActionsProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = translator(lang);

  async function changeStatus(target: SubscriptionStatus, confirm: boolean) {
    if (confirm && !window.confirm(`${t("act.cancelConfirm.pre")}${name}${t("act.cancelConfirm.post")}`)) {
      return;
    }

    setError(null);
    setPending(true);
    try {
      const response = await fetch(`/api/subscriptions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: target }),
      });

      // Navigation paths keep the buttons disabled until the page unloads —
      // resetting state here would briefly re-enable them mid-navigation.
      if (response.ok) {
        window.location.reload();
        return;
      }
      if (response.status === 401) {
        window.location.assign("/auth/signin");
        return;
      }
      if (response.status === 404) {
        // Stale row (deleted in another tab); reload for a fresh SSR list.
        window.location.reload();
        return;
      }
      setError(t("act.err.status"));
    } catch {
      setError(t("f.err.network"));
    }
    setPending(false);
  }

  return (
    <span className="inline-flex items-center gap-2">
      {statusActions(status).map((action) => (
        <Button
          key={action.label}
          type="button"
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => {
            void changeStatus(action.target, action.confirm);
          }}
        >
          {t(ACTION_LABEL_KEYS[action.label] ?? "act.pause")}
        </Button>
      ))}
      {error && (
        <span role="alert" className="text-destructive text-xs">
          {error}
        </span>
      )}
    </span>
  );
}
