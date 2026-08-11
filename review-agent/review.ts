import { readFileSync } from "node:fs";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { REVIEW_SCHEMA, REVIEW_JSON_SCHEMA, SYSTEM_PROMPT, type Review } from "./common/review-schema.js";

/**
 * Niezależny agent code review (Claude Agent SDK).
 *
 * Użycie:
 *   git diff | npx tsx review.ts          # diff ze stdin
 *   npx tsx review.ts plik.diff           # diff z pliku
 *
 * Auth: lokalnie SDK podejmuje credentiale aktywnej sesji Claude Code;
 * w CI ustaw ANTHROPIC_API_KEY w env.
 */

const MAX_BUDGET_USD = 0.5; // twardy sufit kosztu pojedynczego przebiegu

interface RunMetrics {
  costUsd: number;
  numTurns: number;
  durationMs: number;
  inputTokens: number;
  outputTokens: number;
}

async function readDiff(): Promise<string> {
  const fileArg = process.argv[2];
  if (fileArg) return readFileSync(fileArg, "utf8");
  if (process.stdin.isTTY) {
    throw new Error("Brak diffa: przekaż go przez stdin (git diff | npx tsx review.ts) albo jako plik.");
  }
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

async function review(diff: string): Promise<{ review: Review; metrics: RunMetrics }> {
  const result = query({
    prompt: `Zrecenzuj ten diff:\n\n${diff}`,
    options: {
      systemPrompt: SYSTEM_PROMPT,
      model: "claude-sonnet-4-6",
      tools: [], // recenzja ma być wąska i przewidywalna — bez narzędzi
      maxTurns: 2, // tura 1: analiza diffa, tura 2: emisja structured output
      maxBudgetUsd: MAX_BUDGET_USD,
      outputFormat: { type: "json_schema", schema: REVIEW_JSON_SCHEMA },
    },
  });

  for await (const message of result) {
    if (message.type !== "result") continue;

    if (message.subtype === "success") {
      const parsed = REVIEW_SCHEMA.safeParse(message.structured_output);
      if (!parsed.success) {
        throw new Error(`Niepoprawny structured output: ${parsed.error.message}`);
      }
      return {
        review: parsed.data,
        metrics: {
          costUsd: message.total_cost_usd,
          numTurns: message.num_turns,
          durationMs: message.duration_ms,
          inputTokens: message.usage.input_tokens,
          outputTokens: message.usage.output_tokens,
        },
      };
    }

    if (message.subtype === "error_max_budget_usd") {
      throw new Error(
        `Przekroczono limit kosztu ${MAX_BUDGET_USD.toFixed(2)} USD — przebieg zatrzymany (koszt: ${message.total_cost_usd.toFixed(4)} USD).`,
      );
    }

    const errors = "errors" in message ? message.errors.join("; ") : "brak szczegółów";
    throw new Error(`Review nie powiodło się (${message.subtype}): ${errors}`);
  }

  throw new Error("Agent nie zwrócił wyniku");
}

function printHumanSummary(r: Review, m: RunMetrics): void {
  const line = (label: string, score: number) => `  ${label.padEnd(22)} ${String(score).padStart(2)}/10`;
  console.error("\n=== Code Review ===");
  console.error(line("Poprawność", r.implementationCorrectness));
  console.error(line("Idiomatyczność", r.idiomaticity));
  console.error(line("Złożoność", r.complexity));
  console.error(line("Pokrycie testami", r.testRiskCoverage));
  console.error(line("Bezpieczeństwo", r.securitySafety));
  console.error(`\n  Werdykt: ${r.verdict === "pass" ? "✅ PASS" : "❌ FAIL"}`);
  console.error(`\n${r.summary}`);
  console.error("\n=== Metryki ===");
  console.error(`  koszt:  $${m.costUsd.toFixed(4)} (limit $${MAX_BUDGET_USD.toFixed(2)})`);
  console.error(`  tury:   ${m.numTurns}`);
  console.error(`  czas:   ${(m.durationMs / 1000).toFixed(1)}s`);
  console.error(`  tokeny: ${m.inputTokens} in / ${m.outputTokens} out`);
}

const diff = await readDiff();
if (!diff.trim()) {
  console.error("Pusty diff — nie ma czego recenzować.");
  process.exit(1);
}

const { review: reviewResult, metrics } = await review(diff);

// JSON na stdout (maszynowo, np. do dalszego pipeline'u CI); podsumowanie na stderr
console.log(JSON.stringify({ review: reviewResult, metrics }, null, 2));
printHumanSummary(reviewResult, metrics);
