---
name: quality-gate-safe-delivery
description: Validate API, desktop and frontend code changes with the repository's coverage, quality-gate and microbenchmark checks while keeping benchmark and gate rules immutable.
---

# Safe Quality Gate Delivery

Use this skill when finishing a task that changes API, desktop or frontend code, tests, configuration, scripts or CI. Its purpose is to deliver validated work while preserving the rules used to detect regressions.

## Invariants

- Read the root `AGENTS.md` before validating. Repository instructions are the source of truth.
- Do not change benchmark or quality-gate variables, inputs, scenario sizes, thresholds, tolerances, baselines, approval criteria, commands or logic to make a task pass.
- Do not change files outside the implementation scope. Fix a regression in the files the task changed and their direct dependencies; do not touch an unrelated file only because it improves a score.
- If the real cause is outside the task scope, record the evidence and ask for an explicit scope expansion.
- Preserve existing user changes. If they already touch a protected file, report the conflict instead of rewriting them.
- Commit, push, rerun workflows or perform other external changes only when the task authorizes them.

## Protected rule files

Treat every path in `scripts/protected-paths.json` (listed in the root `AGENTS.md`) as read-only during a normal implementation fix. A legitimate change to the validation infrastructure needs its own explicit task, a same-repository `ci/` branch and the `validation-infrastructure-approved` label.

In CI, the gates compare a pull request with its base measured on the same runner, so no checked-in snapshot needs updating after an improvement, and editing a baseline cannot make a regression pass.

## Validation sequence

Run the complete checklist in the root `AGENTS.md`, then read `reports/quality-gate.md` and `reports/performance.md`. When a gate fails, fix the code that caused the regression and rerun the affected commands. Report each command with its real result.
