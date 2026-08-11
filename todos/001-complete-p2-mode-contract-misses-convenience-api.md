---
status: complete
priority: p2
issue_id: "001"
tags: [code-review, architecture, api, planning, quality]
dependencies: []
---

# Mode contract misses the convenience API

## Problem Statement
The plan says all extraction entry points should stay aligned, but the proposed API sketch only adds `mode` to `ExtractionOptions`. That leaves the one-shot `extract(text, config)` path under-specified, because today that helper only accepts `ExtractorConfig` and has no second `ExtractionOptions` parameter.

## Findings
- Plan claims API surface parity across `extract()`, `createExtractor()`, `Extractor.extract()`, and the CLI: `docs/plans/2026-03-24-feat-staged-small-model-extraction-mode-plan.md:352-360`
- Pseudo API only adds `mode` to `ExtractionOptions`: `docs/plans/2026-03-24-feat-staged-small-model-extraction-mode-plan.md:212-217`
- Phase 1 tasks do not mention `packages/graph-extract/src/extract.ts` or `ExtractorConfig`: `docs/plans/2026-03-24-feat-staged-small-model-extraction-mode-plan.md:255-260`
- Current implementation confirms the convenience helper only takes `ExtractorConfig`: `packages/graph-extract/src/extract.ts:9-16`

## Proposed Solutions

### Option 1: Add `mode` to `ExtractorConfig` and allow per-call override in `ExtractionOptions`
**Pros:** Preserves parity across all public entry points; supports reusable extractor defaults and one-off overrides.
**Cons:** Slightly expands the config surface.
**Effort:** Small
**Risk:** Low

### Option 2: Keep `mode` only on `ExtractionOptions` and add a second convenience helper for staged extraction
**Pros:** Minimal change to existing config types.
**Cons:** Fragments the API and contradicts the plan's parity goal.
**Effort:** Medium
**Risk:** Medium

### Option 3: Document that the convenience helper stays single-mode only in v1
**Pros:** Simplest implementation.
**Cons:** Breaks the stated product requirement that library callers can choose `single` or `staged`.
**Effort:** Small
**Risk:** High

## Recommended Action
Resolved in the plan. `mode` now lives in `ExtractorConfig` with an optional per-call override in `ExtractionOptions`, and the plan explicitly includes `packages/graph-extract/src/extract.ts` in the mode-aware API surface.

## Technical Details
- Affected plan sections:
  - API sketch
  - Phase 1 tasks
  - Acceptance criteria
- Likely implementation files:
  - `packages/graph-extract/src/types.ts`
  - `packages/graph-extract/src/extract.ts`
  - `packages/graph-extract/src/extractor.ts`
  - `packages/graph-extract/src/index.ts`

## Acceptance Criteria
- [ ] The plan explicitly defines where `mode` lives in `ExtractorConfig`, `ExtractionOptions`, or both
- [ ] The plan explains how callers choose mode through `extract()`, `createExtractor()`, and `Extractor.extract()`
- [ ] Phase 1 tasks and acceptance criteria mention every public API that needs updating

## Work Log
- 2026-03-24: Identified parity gap between the plan’s API goals and the current `extract(text, config)` helper.
- 2026-03-24: Updated the plan to place `mode` in `ExtractorConfig`, allow per-call override in `ExtractionOptions`, and cover `packages/graph-extract/src/extract.ts` explicitly.

## Resources
- Plan: `docs/plans/2026-03-24-feat-staged-small-model-extraction-mode-plan.md`
- Related code: `packages/graph-extract/src/extract.ts`
- Origin brainstorm: `docs/brainstorms/2026-03-24-small-model-staged-extraction-brainstorm.md`
