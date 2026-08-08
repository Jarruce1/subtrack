// Unit tests for FR-014 / US-03 duplicate-name detection. Every expected
// value is hand-derived from PRD Business Logic §5 ("trimmed, lowercased,
// inner whitespace collapsed") and the US-03 example ("Spotify " vs
// "spotify"), never from the implementation (test-plan §6.1 oracle rule).
import { describe, expect, it } from "vitest";
import { findDuplicateName, normalizeName } from "@/lib/duplicates";

describe("normalizeName — PRD Business Logic §5", () => {
  it("trims leading and trailing whitespace", () => {
    // "  netflix " → trim → "netflix"
    expect(normalizeName("  netflix ")).toBe("netflix");
  });

  it("lowercases", () => {
    // "NetFlix" → lowercase → "netflix"
    expect(normalizeName("NetFlix")).toBe("netflix");
  });

  it("collapses an inner whitespace run to a single space", () => {
    // "Netflix   HD" → collapse → "netflix hd"
    expect(normalizeName("Netflix   HD")).toBe("netflix hd");
  });

  it("collapses tabs and newlines like spaces (any whitespace run)", () => {
    // "a\t\n b" → every \s+ run becomes one space → "a b"
    expect(normalizeName("a\t\n b")).toBe("a b");
  });

  it("collapses multiple separate inner runs", () => {
    // " My  Cloud   Storage  " → "my cloud storage"
    expect(normalizeName(" My  Cloud   Storage  ")).toBe("my cloud storage");
  });

  it("applies the US-03 example: 'Spotify ' and 'spotify' normalize identically", () => {
    // US-03: existing "Spotify " vs added "spotify" must match
    expect(normalizeName("Spotify ")).toBe(normalizeName("spotify"));
  });

  it("maps empty and whitespace-only strings to the empty string", () => {
    expect(normalizeName("")).toBe("");
    expect(normalizeName("   \t\n ")).toBe("");
  });

  it("is idempotent", () => {
    const once = normalizeName("  NetFlix   HD ");
    expect(normalizeName(once)).toBe(once);
  });
});

describe("findDuplicateName — FR-014 detection", () => {
  const existing = [
    { id: "id-1", name: "Spotify " },
    { id: "id-2", name: "Netflix" },
    { id: "id-3", name: "netflix" },
  ];

  it("matches via normalization (US-03: adding 'spotify' when 'Spotify ' exists)", () => {
    expect(findDuplicateName("spotify", existing)).toEqual({ id: "id-1", name: "Spotify " });
  });

  it("matches a candidate with padding and case noise (' netflix  ')", () => {
    expect(findDuplicateName(" netflix  ", existing)).toEqual({ id: "id-2", name: "Netflix" });
  });

  it("returns null when nothing matches", () => {
    expect(findDuplicateName("Gym", existing)).toBeNull();
  });

  it("skips the excluded row (edit mode: unchanged name never self-matches)", () => {
    // Editing id-2 and keeping "Netflix": id-2 excluded, but id-3 ("netflix")
    // still matches — only the row under edit is exempt.
    expect(findDuplicateName("Netflix", existing, "id-2")).toEqual({ id: "id-3", name: "netflix" });
  });

  it("returns null when the only match is the excluded row", () => {
    expect(findDuplicateName("spotify", existing, "id-1")).toBeNull();
  });

  it("returns the first match when several rows share a normalized name", () => {
    expect(findDuplicateName("NETFLIX", existing)).toEqual({ id: "id-2", name: "Netflix" });
  });

  it("never matches an empty or whitespace-only candidate", () => {
    const padded = [{ id: "id-x", name: "   " }];
    expect(findDuplicateName("", padded)).toBeNull();
    expect(findDuplicateName("   ", padded)).toBeNull();
  });

  it("returns null against an empty existing list", () => {
    expect(findDuplicateName("Netflix", [])).toBeNull();
  });
});
