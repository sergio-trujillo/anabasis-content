/**
 * Enrich Capital One code exercises with examples, constraints, hints,
 * and reference solution via Claude Sonnet 4.6.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=... bun run enrich -- --dry-run --limit=5
 *   ANTHROPIC_API_KEY=... bun run enrich -- --live --section=module-1-warmup
 *   ANTHROPIC_API_KEY=... bun run enrich -- --file=capital-one/gca/module-1-warmup/.../foo.json --live
 *
 * Safety:
 * - Default mode is dry-run. Must pass --live to write to disk.
 * - Skips files that already have examples, constraints, and hints populated.
 * - Validates Sonnet's output against a Zod schema; rejects on parse failure.
 * - Cross-checks the generated examples against testCode (at least one
 *   output string must appear in the asserts) or the file is flagged and
 *   NOT written, surfacing in the report as `needs-review`.
 */

import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readdirSync, statSync } from "node:fs";
import { z } from "zod";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT_ROOT = resolve(HERE, "..");
const CAPITAL_ONE_ROOT = join(CONTENT_ROOT, "capital-one");

// ─────────────────────────────────────────────────────────────────────────
// Output schema — what we ask Sonnet to return.
// Keep input/output as plain strings (code/data, not translated). The
// explanation, constraints, hints, and solution explanation are bilingual.
// ─────────────────────────────────────────────────────────────────────────

const Bilingual = z.object({ en: z.string(), es: z.string() });

const EnrichmentSchema = z.object({
  examples: z
    .array(
      z.object({
        input: z.string(),
        output: z.string(),
        explanation: Bilingual.optional(),
      }),
    )
    .min(2)
    .max(4),
  constraints: z.object({
    en: z.array(z.string()).min(1).max(6),
    es: z.array(z.string()).min(1).max(6),
  }),
  hints: z.object({
    en: z.array(z.string()).min(3).max(5),
    es: z.array(z.string()).min(3).max(5),
  }),
  solution: z.object({
    code: z.string(),
    explanation: Bilingual,
    complexity: Bilingual,
  }),
});

type Enrichment = z.infer<typeof EnrichmentSchema>;

// ─────────────────────────────────────────────────────────────────────────
// Input exercise shape (subset we actually consume).
// ─────────────────────────────────────────────────────────────────────────

const ExerciseSchema = z
  .object({
    id: z.string(),
    type: z.literal("code"),
    section: z.string(),
    title: Bilingual,
    difficulty: z.string(),
    language: z.string(),
    statement: Bilingual,
    starterCode: z.string(),
    testCode: z.string(),
    examples: z.unknown().optional(),
    constraints: z.unknown().optional(),
    hints: z.unknown().optional(),
    solution: z.unknown().optional(),
  })
  .passthrough();

type Exercise = z.infer<typeof ExerciseSchema>;

// ─────────────────────────────────────────────────────────────────────────
// System prompt — the stable, cacheable chunk. Anything volatile (the
// actual exercise) lives in the user turn so prompt caching stays warm
// across the batch.
// ─────────────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an expert interview-prep content author for the Anabasis platform.

You enrich Java coding exercises with LeetCode-style supplementary content:
examples, constraints, hints, and a reference solution. The exercises are
part of the Capital One General Coding Assessment prep, so the tone matters:
rigorous, clear, aimed at an engineer with ~1–3 years of experience who is
preparing under time pressure.

You will be given, in the user turn:
- The problem statement (bilingual en + es).
- The Java starter code.
- The Java JUnit test code.

Your job is to return a JSON object that STRICTLY matches this schema:

{
  "examples": [                     // 2–4 worked examples drawn from the test cases
    {
      "input": "string",            // plain text, e.g. 'nums = [1, 2, 3], target = 5'
      "output": "string",           // e.g. '2'
      "explanation": {              // optional — add when output is not obvious
        "en": "string",
        "es": "string"
      }
    }
  ],
  "constraints": {                  // 1–6 bullet-sized constraints per locale
    "en": ["0 <= nums.length <= 10^4", "-10^9 <= nums[i] <= 10^9"],
    "es": ["0 <= nums.length <= 10^4", "-10^9 <= nums[i] <= 10^9"]
  },
  "hints": {                        // 3–5 progressive hints per locale
    "en": ["Start by noticing X...", "You only need one pass...", "Watch out for overflow..."],
    "es": ["Empieza notando X...", "Basta con una pasada...", "Cuidado con el overflow..."]
  },
  "solution": {
    "code": "class Solution { ... }",   // actual working Java that passes all tests
    "explanation": { "en": "...", "es": "..." },
    "complexity": { "en": "**Time:** O(n)...", "es": "**Tiempo:** O(n)..." }
  }
}

Critical rules:

1. EXAMPLES must be derived from the actual test cases. Read the testCode
   carefully. The "output" string must match what the test expects. Include
   one typical case, one edge case (empty / single element / all negatives),
   and one harder case when possible.

2. CONSTRAINTS should be plausible and realistic for a GCA-style problem.
   Use conventional notation: \`10^4\`, \`-10^9 <= x <= 10^9\`, etc.

3. HINTS must be progressive — earliest hint is a light nudge, latest hint
   almost gives away the approach. Do NOT include the full solution in the
   hints.

4. SOLUTION.code must be real Java that compiles and passes every test case
   in testCode. Never write pseudo-code. Include any needed imports at the
   top (e.g. \`import java.util.*;\`). Do NOT include package statements.

5. SOLUTION.complexity should use markdown bold for **Time:** and **Space:**.

6. BILINGUAL content: English first, then a faithful Spanish translation.
   Technical terms stay in English inside backticks ("pointer", "heap") but
   everything else must read naturally in Spanish.

Output ONLY the JSON object. No preamble, no commentary, no markdown fences.`;

// ─────────────────────────────────────────────────────────────────────────
// CLI parsing (minimal — no external dep).
// ─────────────────────────────────────────────────────────────────────────

type Args = {
  live: boolean;
  limit: number;
  sectionPattern: RegExp | null;
  file: string | null;
  force: boolean;
};

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const out: Args = {
    live: false,
    limit: Infinity,
    sectionPattern: null,
    file: null,
    force: false,
  };
  for (const arg of argv) {
    if (arg === "--live") out.live = true;
    else if (arg === "--dry-run") out.live = false;
    else if (arg === "--force") out.force = true;
    else if (arg.startsWith("--limit=")) out.limit = Number(arg.slice(8));
    else if (arg.startsWith("--section=")) {
      out.sectionPattern = new RegExp(arg.slice(10));
    } else if (arg.startsWith("--file=")) out.file = arg.slice(7);
    else if (arg === "-h" || arg === "--help") {
      printHelp();
      process.exit(0);
    } else {
      console.error(`Unknown flag: ${arg}`);
      printHelp();
      process.exit(1);
    }
  }
  return out;
}

function printHelp(): void {
  console.log(`Enrich code exercises with examples / constraints / hints / solution.

Flags:
  --dry-run          Show what would be written (default).
  --live             Actually write files.
  --limit=N          Process at most N exercises.
  --section=REGEX    Only files whose path matches this regex.
  --file=PATH        Process a single file (relative to anabasis-content/).
  --force            Re-enrich files that already have all three fields.
`);
}

// ─────────────────────────────────────────────────────────────────────────
// Filesystem walk.
// ─────────────────────────────────────────────────────────────────────────

function* walkJson(root: string): Generator<string> {
  for (const entry of readdirSync(root)) {
    if (entry.startsWith(".") || entry.startsWith("_")) continue;
    const full = join(root, entry);
    const st = statSync(full);
    if (st.isDirectory()) yield* walkJson(full);
    else if (entry.endsWith(".json")) yield full;
  }
}

function collectCodeFiles(args: Args): string[] {
  if (args.file) {
    return [resolve(CONTENT_ROOT, args.file)];
  }
  const out: string[] = [];
  for (const path of walkJson(CAPITAL_ONE_ROOT)) {
    if (args.sectionPattern && !args.sectionPattern.test(path)) continue;
    try {
      const raw = JSON.parse(readFileSync(path, "utf8"));
      if (raw && typeof raw === "object" && raw.type === "code") out.push(path);
    } catch {
      // skip malformed JSON
    }
  }
  return out;
}

function needsEnrichment(ex: Exercise, force: boolean): boolean {
  if (force) return true;
  const has = (k: keyof Exercise) =>
    ex[k] !== undefined && ex[k] !== null && !(Array.isArray(ex[k]) && ex[k].length === 0);
  return !(has("examples") && has("constraints") && has("hints") && has("solution"));
}

// ─────────────────────────────────────────────────────────────────────────
// Heuristic validation — at least one example output should appear in the
// JUnit test code (assertEquals asserts), catching hallucinated outputs.
// ─────────────────────────────────────────────────────────────────────────

function examplesLookGrounded(enrichment: Enrichment, testCode: string): boolean {
  const normalized = testCode.replace(/\s+/g, "");
  return enrichment.examples.some((ex) => {
    const o = ex.output.trim();
    if (!o) return false;
    // Allow matching either the raw output or a quoted version.
    return (
      normalized.includes(o.replace(/\s+/g, "")) ||
      normalized.includes(`"${o}"`) ||
      // Numeric output tolerance — exact substring match already covers this.
      false
    );
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Claude call — one exercise at a time. Uses prompt caching on the system
// prompt (large, stable) so only the exercise payload pays full price.
// ─────────────────────────────────────────────────────────────────────────

async function enrichOne(
  client: Anthropic,
  ex: Exercise,
): Promise<Enrichment> {
  const userPrompt = `# Exercise to enrich

## id
${ex.id}

## difficulty
${ex.difficulty}

## title.en
${ex.title.en}

## title.es
${ex.title.es}

## statement.en
${ex.statement.en}

## statement.es
${ex.statement.es}

## starterCode
\`\`\`java
${ex.starterCode}
\`\`\`

## testCode
\`\`\`java
${ex.testCode}
\`\`\`

Return only the JSON object. No markdown fences, no preamble.`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 16000,
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: userPrompt }],
  });

  const textBlock = response.content.find(
    (b): b is Anthropic.TextBlock => b.type === "text",
  );
  if (!textBlock) {
    throw new Error(`No text block in response for ${ex.id}`);
  }

  // Strip potential markdown fences defensively (Sonnet is told not to
  // emit them but we verify).
  let raw = textBlock.text.trim();
  if (raw.startsWith("```")) {
    raw = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  const parsed = JSON.parse(raw);
  return EnrichmentSchema.parse(parsed);
}

// ─────────────────────────────────────────────────────────────────────────
// Main.
// ─────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs();
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY environment variable is required.");
    process.exit(2);
  }
  const client = new Anthropic();

  const candidates = collectCodeFiles(args);
  console.log(`Found ${candidates.length} code exercise file(s) under capital-one/.`);

  const report = {
    enriched: [] as string[],
    skipped: [] as string[],
    needsReview: [] as string[],
    failed: [] as { path: string; error: string }[],
  };

  let processed = 0;
  for (const path of candidates) {
    if (processed >= args.limit) break;

    const relPath = relative(CONTENT_ROOT, path);
    let exercise: Exercise;
    try {
      const raw = JSON.parse(readFileSync(path, "utf8"));
      exercise = ExerciseSchema.parse(raw);
    } catch (err) {
      report.failed.push({ path: relPath, error: `invalid exercise JSON: ${err}` });
      continue;
    }

    if (!needsEnrichment(exercise, args.force)) {
      report.skipped.push(relPath);
      continue;
    }

    processed += 1;
    process.stdout.write(`[${processed}] ${relPath} ... `);

    let enrichment: Enrichment;
    try {
      enrichment = await enrichOne(client, exercise);
    } catch (err) {
      console.log("FAILED");
      report.failed.push({ path: relPath, error: String(err) });
      continue;
    }

    if (!examplesLookGrounded(enrichment, exercise.testCode)) {
      console.log("NEEDS REVIEW (examples not grounded in testCode)");
      report.needsReview.push(relPath);
      continue;
    }

    if (args.live) {
      const merged = {
        ...exercise,
        examples: enrichment.examples,
        constraints: enrichment.constraints,
        hints: enrichment.hints,
        solution: enrichment.solution,
      };
      writeFileSync(path, `${JSON.stringify(merged, null, 2)}\n`, "utf8");
      console.log("WROTE");
    } else {
      console.log(
        `OK (dry-run — ${enrichment.examples.length} examples, ${enrichment.constraints.en.length} constraints, ${enrichment.hints.en.length} hints)`,
      );
    }
    report.enriched.push(relPath);
  }

  console.log("\n=== Report ===");
  console.log(`enriched:     ${report.enriched.length}`);
  console.log(`skipped:      ${report.skipped.length} (already enriched; pass --force to re-run)`);
  console.log(`needs review: ${report.needsReview.length}`);
  console.log(`failed:       ${report.failed.length}`);
  if (report.needsReview.length > 0) {
    console.log("\nNeeds review:");
    for (const p of report.needsReview) console.log(`  ${p}`);
  }
  if (report.failed.length > 0) {
    console.log("\nFailed:");
    for (const f of report.failed) console.log(`  ${f.path}\n    ${f.error}`);
  }
  if (!args.live && report.enriched.length > 0) {
    console.log("\n(dry-run — no files written. Re-run with --live to commit.)");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
