# anabasis-content — scripts

## enrich-code-exercises.ts

Enriches Capital One `type: "code"` exercises with `examples`, `constraints`, `hints`, and a reference `solution` via Claude Sonnet 4.6.

### Setup

```bash
cd scripts
bun install
```

### Usage

```bash
# Dry-run 5 exercises (default). Nothing is written.
ANTHROPIC_API_KEY=sk-ant-... bun run enrich -- --limit=5

# Dry-run the whole module-1-warmup section.
ANTHROPIC_API_KEY=sk-ant-... bun run enrich -- --section=module-1-warmup

# Go live for a single file.
ANTHROPIC_API_KEY=sk-ant-... bun run enrich -- --file=capital-one/gca/module-1-warmup/array-accumulator/first-threshold-index.json --live --force

# Go live for a whole section after a dry-run looked clean.
ANTHROPIC_API_KEY=sk-ant-... bun run enrich -- --section=module-1-warmup --live
```

### Flags

| Flag | Effect |
|---|---|
| `--dry-run` | Default. Prints the plan; no writes. |
| `--live` | Write results back to each JSON file. |
| `--limit=N` | Cap at N files this run. |
| `--section=REGEX` | Only paths matching this regex. |
| `--file=PATH` | Single file, relative to `anabasis-content/`. |
| `--force` | Re-enrich files that already have examples/constraints/hints/solution. |

### Safety

- Exercises already carrying all four enrichment fields are skipped unless `--force`.
- The model's output is validated against a Zod schema (`EnrichmentSchema`).
- A heuristic ensures at least one example `output` string appears in the exercise's `testCode` — if no example is grounded, the file is flagged `needs-review` and **not** written.
- Expected cost: ~$0.04–0.08 per exercise on Sonnet 4.6, with prompt caching amortizing the large system prompt across the batch.

### Suggested workflow

1. `--limit=5 --dry-run` → manually inspect the terminal log.
2. Pick 1–2 paths you saw, re-run with `--file=... --live --force`, open the resulting JSON, spot-check the Spanish, the solution code, and that examples match the tests.
3. When confident, run the full batch per section: `--section=module-1-warmup --live`, review the diff, commit; repeat for the next section.
