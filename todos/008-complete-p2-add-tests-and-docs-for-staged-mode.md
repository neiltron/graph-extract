---
status: complete
priority: p2
issue_id: "008"
tags: [implementation, tests, docs, staged-extraction]
dependencies: ["006", "007"]
---

# Add tests and docs for staged mode

## Problem Statement
The new staged mode must be covered by focused tests and documented in the library README/spec so the behavior is understandable and safe to ship.

## Findings
- Existing tests only cover single-pass behavior.
- The plan requires coverage for staged success, empty relationships, unresolved endpoints, case-normalization, debug artifacts, and CLI mode handling.

## Proposed Solutions
### Option 1: Extend current tests and add staged-specific test files
**Pros:** Matches existing repo patterns.
**Cons:** Requires several fixtures/mocks.
**Effort:** Medium
**Risk:** Low

## Recommended Action
Implement Option 1.

## Technical Details
- Affected files:
  - `packages/graph-extract/test/extract.test.ts`
  - `packages/graph-extract/test/staged-prompt.test.ts`
  - `packages/graph-extract/test/staged-compile.test.ts`
  - `apps/cli/src/commands/extract.test.ts`
  - `README.md`
  - `docs/spec.md`
  - `docs/plans/2026-03-24-feat-staged-small-model-extraction-mode-plan.md`

## Acceptance Criteria
- [ ] Staged behavior is tested end-to-end at the extractor level
- [ ] CLI mode and env layering are tested
- [ ] README and spec document both modes
- [ ] Completed plan checkboxes reflect finished work

## Work Log
- 2026-03-24: Created implementation task.
- 2026-03-24: Added staged extractor, prompt, compiler, and CLI tests; updated README and spec documentation; ran lint, tests, typecheck, and build.

## Resources
- Plan: `docs/plans/2026-03-24-feat-staged-small-model-extraction-mode-plan.md`
