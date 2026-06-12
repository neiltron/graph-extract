---
status: complete
priority: p2
issue_id: "007"
tags: [implementation, architecture, staged-extraction, reliability]
dependencies: ["006"]
---

# Build staged extraction pipeline

## Problem Statement
Small-model mode needs a staged extraction flow with minimal model-facing schemas and deterministic graph compilation.

## Findings
- The current extractor is single-pass only.
- The plan requires entity extraction, relationship extraction, strict reconciliation, stage-specific schemas, and aggregated staged metadata.

## Proposed Solutions
### Option 1: Add staged prompts, stage parsing, compilation, and extractor orchestration
**Pros:** Matches plan scope while preserving single-pass behavior.
**Cons:** Adds new internal modules.
**Effort:** Medium
**Risk:** Medium

## Recommended Action
Implement Option 1.

## Technical Details
- Affected files:
  - `packages/graph-extract/src/extractor.ts`
  - `packages/graph-extract/src/staged-prompt.ts`
  - `packages/graph-extract/src/staged-parse.ts`
  - `packages/graph-extract/src/staged-compile.ts`
  - `packages/graph-extract/src/index.ts`

## Acceptance Criteria
- [ ] Staged mode runs two passes
- [ ] Stage outputs avoid IDs
- [ ] Compiler performs strict exact-text reconciliation and builds final graph
- [ ] `raw`, `usage`, and debug semantics follow the plan
- [ ] `responseFormat` supports stage-specific JSON behavior

## Work Log
- 2026-03-24: Created implementation task.
- 2026-03-24: Added staged prompts, staged parsing, deterministic graph compilation, staged extractor orchestration, stage-specific structured output handling, and aggregated staged metadata.

## Resources
- Plan: `docs/plans/2026-03-24-feat-staged-small-model-extraction-mode-plan.md`
