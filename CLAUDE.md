# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

น้ำท่วมไหม is a small teaching app for the course AI Coding with Claude (CodePassion Academy). It is **not an official flood warning service**, and all water levels are made-up data.

## Commands

Requires Node.js 22+. There is no build step: `tsx` runs TypeScript directly, and `tsc` only type-checks.

```bash
npm install
npm test                                       # vitest run (all tests)
npx vitest run tests/app.test.ts               # one file
npx vitest run -t "returns 404"                # tests whose name matches
npm run lint                                   # tsc --noEmit (type check only)
npm run dev                                    # tsx watch, http://localhost:3000
```

## Architecture

- `src/app.ts` `handle(method, path, body, ctx)` holds all routing. It is a function free of `node:http` that returns `{ status, body }`.
  - Tests call `handle()` directly. There are no HTTP calls in tests.
  - `ctx.now` is injected so time-dependent logic is deterministic. Use `ctx.now` and never `new Date()` inside logic.
- `src/server.ts` is a thin `node:http` wrapper. It reads the body, returns 400 for invalid JSON before `handle()` is called, then calls `handle()`.
- `src/stations.ts` loads `data/stations.json` at import time through a JSON import attribute. `latestReading` ignores readings after `now`.
- `src/districts.ts` contains 12 of Bangkok's 50 districts. Each is keyed by a slug id such as `lat-phrao`, which is used in URL paths.
- Every public response body includes `NOTICE` (teaching-only disclaimer) from `src/app.ts`.
- TypeScript runs with `strict` and `noUncheckedIndexedAccess`. Relative imports use the `.ts` extension, e.g. `import { handle } from "../src/app.ts"`.

## Domain rules

- Depths and water levels are **integer centimetres**.
- Times are **stored in UTC** and shown as Bangkok time (UTC+7, no DST) via `toBangkokIso` in `src/time.ts`.
- Severity uses the workshop guide's **3 levels: 1–20, 21–50, >50 cm**. The `class-demo` tags `cp5-loop` to `cp8-hooks` use 4 levels instead. Do not copy them.
- **Never send POST or DELETE requests to real flood systems** such as ROOP TAN JAI Flood Watch (`flood-api.rooptanjai.com`), including during testing. People rely on it during real floods. Only read-only GET requests are allowed.
- Any feature that handles public input or personal data must follow the `security-baseline` skill (`.claude/skills/security-baseline/SKILL.md`).

## Feature work: flood reports

The class adds a feature that lets residents report flooded spots. Design docs live in `docs/`:

- `docs/intent/flood-reports.md`: the problem, the outcome, constraints and open questions
- `docs/specs/flood-reports.md`: requirements `RPT-REQ-xxx` with acceptance criteria, the design, and edge cases

Read the spec before implementing, and write tests from its acceptance criteria.

## Branches

- `main`: the starting point, with no flood reports yet
- `class-demo`: the finished class result. Tags `cp1-intent` … `cp8-hooks` mark each workshop checkpoint.
- `example/coupon`: an older exercise kept for reference
