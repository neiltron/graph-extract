---
status: complete
priority: p2
issue_id: "003"
tags: [code-review, architecture, reliability, cli, planning]
dependencies: []
---

# `responseFormat` semantics are ambiguous in staged mode

## Problem Statement
The plan says staged mode should reuse existing response-format wiring where practical, but the current `json_schema` behavior is built around the final graph schema. In staged mode, each pass has a different schema, so the current CLI and provider contract becomes ambiguous.

## Findings
- The plan says staged mode should reuse `response format wiring`: `docs/plans/2026-03-24-feat-staged-small-model-extraction-mode-plan.md:175`
- The plan also says existing response-format support should remain available to each stage where applicable: `docs/plans/2026-03-24-feat-staged-small-model-extraction-mode-plan.md:433`
- Current implementation only knows how to build `json_object` or `json_schema` for the final graph object: `packages/graph-extract/src/extractor.ts:113-290`
- The CLI already exposes `--response-format`, so users will expect defined behavior in staged mode: `apps/cli/src/index.ts:18-30`, `apps/cli/src/commands/extract.ts:145-155`

## Proposed Solutions

### Option 1: Define stage-specific response schemas and keep `responseFormat` supported in staged mode
**Pros:** Best reliability story for small models; consistent with the staged design.
**Cons:** Requires explicit documentation for each stage’s schema behavior.
**Effort:** Medium
**Risk:** Low

### Option 2: Allow `json_object` in staged mode but disable `json_schema` there in v1
**Pros:** Simpler than maintaining multiple strict schemas.
**Cons:** Weakens constrained decoding right where the plan wants more reliability.
**Effort:** Small
**Risk:** Medium

### Option 3: Keep current flag but leave staged behavior implementation-defined
**Pros:** Fastest short-term path.
**Cons:** Creates user confusion and likely inconsistent implementations.
**Effort:** Small
**Risk:** High

## Recommended Action
Resolved in the plan. `responseFormat` remains JSON-oriented in both modes, with `json_object` preserved and `json_schema` explicitly defined as stage-specific in staged mode.

## Technical Details
- Affected plan sections:
  - Technical approach for staged orchestration
  - CLI mode/config section
  - Dependencies & prerequisites
  - Acceptance criteria and docs plan
- Likely implementation files:
  - `packages/graph-extract/src/extractor.ts`
  - `packages/graph-extract/src/staged-prompt.ts`
  - `apps/cli/src/commands/extract.ts`
  - `README.md`

## Acceptance Criteria
- [ ] The plan states exactly how `responseFormat=json_object` behaves in staged mode
- [ ] The plan states exactly how `responseFormat=json_schema` behaves in staged mode
- [ ] Any staged-mode restrictions or fallbacks are documented in CLI and README requirements

## Work Log
- 2026-03-24: Flagged config ambiguity between existing final-graph structured output and proposed per-stage extraction schemas.
- 2026-03-24: Updated the plan to keep `responseFormat` JSON-oriented in both modes and use stage-specific schemas for staged `json_schema` behavior.

## Resources
- Plan: `docs/plans/2026-03-24-feat-staged-small-model-extraction-mode-plan.md`
- Existing response-format implementation: `packages/graph-extract/src/extractor.ts`
- CLI config path: `apps/cli/src/commands/extract.ts`
