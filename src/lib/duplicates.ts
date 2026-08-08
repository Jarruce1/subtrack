// FR-014 / US-03 duplicate-name detection (PRD Business Logic §5): the new
// name is normalized — trimmed, lowercased, inner whitespace collapsed — and
// compared against the user's existing subscriptions. Detection is advisory
// only; it never blocks a save (two legitimate same-name subscriptions are
// allowed).
//
// Shared by the duplicate-check endpoint (server) and the form island
// (client), so this module must stay client-safe and dependency-free — the
// same convention as src/lib/validation/subscriptions.ts.

/** The minimal projection of a subscription this rule needs. */
export interface NamedEntry {
  id: string;
  name: string;
}

/**
 * Normalize a subscription name for duplicate comparison: trim, lowercase,
 * collapse every inner whitespace run (spaces, tabs, newlines — any `\s`)
 * to a single space. `"  Netflix   HD "` → `"netflix hd"`.
 */
export function normalizeName(name: string): string {
  return name.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * First entry whose normalized name equals the normalized candidate, or null.
 *
 * - `excludeId` skips the row being edited, so an unchanged name in the edit
 *   flow never matches itself (rename path, S-03 edit mode).
 * - A candidate that normalizes to the empty string never matches — there is
 *   nothing meaningful to warn about.
 */
export function findDuplicateName(
  candidate: string,
  existing: readonly NamedEntry[],
  excludeId?: string,
): NamedEntry | null {
  const normalized = normalizeName(candidate);
  if (normalized === "") {
    return null;
  }
  for (const entry of existing) {
    if (entry.id !== excludeId && normalizeName(entry.name) === normalized) {
      return entry;
    }
  }
  return null;
}
