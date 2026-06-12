---
status: complete
priority: p2
issue_id: "006"
tags: [implementation, code-review, api, cli, staged-extraction]
dependencies: []
---

# Plumb staged mode through API and CLI

## Problem Statement
The library and CLI need an explicit `single` vs `staged` mode switch while preserving backward compatibility and existing defaults.

## Findings
- `ExtractorConfig`, `ExtractionOptions`, and CLI args currently do not support mode.
- The plan requires `single` to remain the default and `GRAPH_EXTRACT_MODE` to participate in CLI layering.

## Proposed Solutions
### Option 1: Add mode to config, per-call options, and CLI
**Pros:** Matches the plan and keeps parity across interfaces.
**Cons:** Touches several public-facing types.
**Effort:** Small
**Risk:** Low

## Recommended Action
Implement Option 1.

## Technical Details
- Affected files:
  - `packages/graph-extract/src/types.ts`
  - `packages/graph-extract/src/extract.ts`
  - `packages/graph-extract/src/index.ts`
  - `apps/cli/src/commands/extract.ts`
  - `apps/cli/src/index.ts`

## Acceptance Criteria
- [ ] Core config types support mode
- [ ] CLI supports `--mode` and `GRAPH_EXTRACT_MODE`
- [ ] Default behavior remains `single`

## Work Log
- 2026-03-24: Created implementation task.
- 2026-03-24: Added `mode` to extraction config/types, updated CLI mode parsing and env layering, and verified behavior with focused tests.

## Resources
- Plan: `docs/plans/2026-03-24-feat-staged-small-model-extraction-mode-plan.md`
