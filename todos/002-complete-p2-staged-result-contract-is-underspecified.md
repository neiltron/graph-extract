---
status: complete
priority: p2
issue_id: "002"
tags: [code-review, architecture, api, operations, planning]
dependencies: []
---

# Staged result contract is underspecified for a multi-call flow

## Problem Statement
The plan keeps the existing `ExtractionResult` shape but does not define what `raw` and `usage` mean once extraction spans multiple LLM calls. Without a clear contract, implementations may diverge and debugging will be inconsistent.

## Findings
- The plan wants staged mode to preserve the same final result shape with optional debug artifacts: `docs/plans/2026-03-24-feat-staged-small-model-extraction-mode-plan.md:19-21`, `286-296`, `397-409`
- The pseudo API still exposes a single `raw: string` and a single aggregate `usage` block: `docs/plans/2026-03-24-feat-staged-small-model-extraction-mode-plan.md:219-233`
- The staged flow explicitly performs at least two LLM calls: `docs/plans/2026-03-24-feat-staged-small-model-extraction-mode-plan.md:316-326`
- Current implementation only has single-call semantics for `raw` and `usage`: `packages/graph-extract/src/extractor.ts:47-68`, `92-131`

## Proposed Solutions

### Option 1: Define `raw` and `usage` as aggregate top-level values and expose per-stage values only in opt-in debug artifacts
**Pros:** Preserves backward compatibility while still supporting debugging.
**Cons:** Requires explicit aggregation rules in the plan.
**Effort:** Small
**Risk:** Low

### Option 2: Replace top-level `raw` with structured `raws` / `stages`
**Pros:** Clear multi-call semantics.
**Cons:** More breaking and contradicts the plan’s “same final result shape” goal.
**Effort:** Medium
**Risk:** Medium

### Option 3: Keep `raw` undefined or last-stage-only in staged mode
**Pros:** Minimal implementation work.
**Cons:** Poor debuggability and surprising behavior for users.
**Effort:** Small
**Risk:** High

## Recommended Action
Resolved in the plan. Staged mode now defines `raw` as the final stage raw response, aggregates `usage` across stages, and limits per-stage raw/usage details to opt-in debug artifacts.

## Technical Details
- Affected plan sections:
  - Pseudo API sketch
  - Debug artifacts section
  - Acceptance criteria
  - Success metrics / operations guidance
- Likely implementation files:
  - `packages/graph-extract/src/types.ts`
  - `packages/graph-extract/src/extractor.ts`

## Acceptance Criteria
- [ ] The plan defines what `ExtractionResult.raw` contains in staged mode
- [ ] The plan defines whether `usage` is summed across stages and whether per-stage usage is exposed
- [ ] The plan clarifies which staged details live in `debug` and which remain part of the stable top-level API

## Work Log
- 2026-03-24: Flagged missing contract for `raw` and token usage in a multi-call extraction flow.
- 2026-03-24: Updated the plan to define `raw` as the final stage raw response, aggregate `usage` across stages, and move per-stage details into opt-in debug artifacts.

## Resources
- Plan: `docs/plans/2026-03-24-feat-staged-small-model-extraction-mode-plan.md`
- Existing extractor behavior: `packages/graph-extract/src/extractor.ts`
