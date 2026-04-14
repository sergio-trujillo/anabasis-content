# anabasis-content

<p align="left">
  <img alt="Content" src="https://img.shields.io/badge/Content-Markdown%20%2B%20JSON-green" />
  <img alt="Bilingual" src="https://img.shields.io/badge/Bilingual-en%20%2B%20es-informational" />
  <img alt="Company" src="https://img.shields.io/badge/v1-Capital%20One-004977" />
  <img alt="Target" src="https://img.shields.io/badge/Target-~1%2C440%20exercises-blueviolet" />
  <img alt="Phase" src="https://img.shields.io/badge/Phase-F3-yellow" />
  <img alt="Part of" src="https://img.shields.io/badge/Part%20of-Anabasis-black" />
  <img alt="License" src="https://img.shields.io/badge/License-Proprietary-red" />
</p>

> Filesystem-driven content repository for **Anabasis**. Bilingual markdown lessons, JSON exercise definitions, Java starter code + JUnit tests, rubric blocks for LLM-judged exercises. Hot-reloaded by the server in dev via `chokidar`.

Sibling to [`anabasis-client`](https://github.com/sergio-trujillo/anabasis-client), [`anabasis-server`](https://github.com/sergio-trujillo/anabasis-server), and [`anabasis-llm`](https://github.com/sergio-trujillo/anabasis-llm). **Not a monorepo, not an npm package** — just a folder of files the server reads at boot.

---

## Layout

```
anabasis-content/
├── companies.json                  # catalog — only Capital One active in v1
├── _helpers/                       # Java ListNode, TreeNode (lifted from Praxema)
├── _lib/
│   └── junit/                      # JUnit 5 standalone JAR
└── capital-one/
    ├── loop.json                   # phases of the Capital One prep path
    ├── gca/                        # CodeSignal General Coding Assessment
    │   ├── overview/
    │   ├── module-1-warmup/
    │   ├── module-2-data-manipulation/
    │   ├── module-3-implementation/
    │   ├── module-4-algorithms/
    │   └── mock/                   # 4-problem / 70-min timed run
    └── power-day/
        ├── overview/
        ├── coding-round-1/
        ├── coding-round-2-job-fit/
        ├── system-design-banking/
        ├── behavioral-excellence/
        ├── behavioral-do-the-right-thing/
        ├── behavioral-respect-for-individuals/
        ├── behavioral-succeed-together/
        ├── story-bank/
        ├── business-case-fundamentals/
        ├── business-case-frameworks/
        ├── business-case-banking/
        └── mock/
```

## Per-exercise file shape

```
<section>/<slug>/
├── exercise.json      # type + metadata + rubric block (for LLM-judged)
├── README.en.md       # statement (English)
├── README.es.md       # statement (Spanish)
├── SOLUTION.en.md     # reference solution
├── SOLUTION.es.md     # reference solution (Spanish)
├── Solution.java      # starter code (code exercises only)
└── SolutionTest.java  # JUnit tests (code exercises only)
```

### Rubric block

LLM-judged exercises carry a `rubric` field in `exercise.json`:

```json
{
  "rubric": {
    "must_include": ["personal_ownership", "measurable_outcome", "specific_numbers"],
    "must_avoid":  ["blame", "vagueness"],
    "value_alignment": "excellence",
    "min_words": 150
  }
}
```

The server's `judge` router reads this block, sends it to the LLM alongside the candidate answer, and returns a score + `hits` / `misses` / `warnings` arrays. F0 validation landed at 9/9 on 9 hand-crafted samples — see parent `F0_REPORT.md`.

---

## Volume target

**~1,440 exercises** for Capital One v1 at **80 per section** (Praxema-validated number — bigger feels like grinding, smaller feels like demo):

| Section kind | Count | Per section |
|---|---|---|
| GCA sections            | 6     | 80          |
| Power Day sections      | 12    | 80          |
| Mock simulations        | 2     | ~1 each     |
| Deep artifacts          | 13    | 8 stories + 5 banking cases |

See parent workspace `README.md` for the full content plan.

## Code variant strategy

Each canonical coding problem ships with **6–8 variants that share the same algorithmic fingerprint** but vary along controlled axes:

| Axis | Examples |
|---|---|
| Wording / story        | banking · retail · healthcare · neutral |
| Input shape            | array · list · string · matrix · linked list |
| Edge case emphasized   | empty · single element · all duplicates · negatives · overflow |
| Return type            | index · value · count · boolean · all matches |
| Constraint             | in-place · new array · recursive · iterative · O(1) space |
| Direction              | forward · reverse · ascending · descending |

The goal is training **pattern recognition under pressure** — by variant 8, the user's brain should fire "this is a complement-lookup problem" within 30 seconds regardless of wording.

---

## Catalog policy

`companies.json` ships with 6 entries. **Only Capital One is selectable in v1.** The other 5 render as greyed-out cards with a lock icon in the client:

| slug | status |
|---|---|
| `capital-one`  | `active`      |
| `stripe`       | `coming-soon` |
| `shopify`      | `coming-soon` |
| `mercadolibre` | `coming-soon` |
| `nubank`       | `coming-soon` |
| `doordash`     | `coming-soon` |

The coming-soon roster is curated to well-documented processes (not pure FAANG): Stripe's integration-day + bug-squash loop, Shopify's Life Story + pair programming, MercadoLibre's LATAM tech challenge, Nubank's pair programming + cultural, DoorDash's LC + system design + behavioral. Do not flip any other company to `active` without shipping its matching `loop.json` + content tree first.

## Bilingual interviewer-chat content

As of F3, every `interviewer-chat` exercise is fully bilingual. The `topic`, `persona`, `must_explore`, and `opening_message` fields each accept either a plain `string` (English-only legacy shape) or `{ en, es }` / `{ en: string[], es: string[] }`. The server resolves the active locale from `chat.start({ locale })` and feeds the interviewer prompt template in the matching language. The Spanish register is neutral professional with tuteo ("tú", never "vos" or "usted"); industry-standard English terms (stateless, framework, tradeoff, stream, pipeline, stakeholder, etc.) stay untranslated.

---

## License

**Proprietary.** Single-author personal project, not open-sourced. No public `LICENSE` file. See the workspace `STATUS.md` decision D19.
