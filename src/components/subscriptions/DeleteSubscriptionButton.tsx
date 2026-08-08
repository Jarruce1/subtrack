import React, { useState } from "react";
import { Button } from "@/components/ui/button";

// FR-007 delete-with-confirmation. The only interactivity the list page needs:
// window.confirm (dependency-free, accessible), DELETE to the item route, then
// a full navigation so the list re-renders from fresh SSR — the established
// "no stale aggregates" mechanism (no client cache to invalidate).

interface DeleteSubscriptionButtonProps {
  id: string;
  name: string;
}

export default function DeleteSubscriptionButton({ id, name }: DeleteSubscriptionButtonProps) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) {
      return;
    }

    setError(null);
    setDeleting(true);
    try {
      const response = await fetch(`/api/subscriptions/${id}`, { method: "DELETE" });

      // Navigation paths keep the button disabled until the page unloads —
      // resetting state here would briefly re-enable it mid-navigation.
      if (response.status === 204) {
        window.location.assign("/subscriptions");
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
      setError("Could not delete. Please try again.");
    } catch {
      setError("Could not reach the server. Please try again.");
    }
    setDeleting(false);
  }

  return (
    <span className="inline-flex items-center gap-2">
      <Button
        type="button"
        variant="destructive"
        size="sm"
        disabled={deleting}
        onClick={() => {
          void handleDelete();
        }}
      >
        {deleting ? "Deleting…" : "Delete"}
      </Button>
      {error && (
        <span role="alert" className="text-destructive text-xs">
          {error}
        </span>
      )}
    </span>
  );
}
