---
status: complete
priority: p2
issue_id: "004"
tags: [code-review, architecture, quality, planning, data]
dependencies: []
---

# Entity canonicalization and endpoint matching rules remain unresolved

## Problem Statement
The deterministic compiler is the core of staged mode, but the plan stops short of defining the canonicalization and matching policy that compiler should use. That leaves a high-risk implementation gap in the most important part of the feature.

## Findings
- The plan correctly identifies compilation as the heart of the reliability improvement: `docs/plans/2026-03-24-feat-staged-small-model-extraction-mode-plan.md:151-165`
- It lists canonicalization, dedupe, and endpoint mapping as compiler responsibilities: `docs/plans/2026-03-24-feat-staged-small-model-extraction-mode-plan.md:157-163`
- The spec-flow gap analysis explicitly says matching strictness still needs to be defined in v1: `docs/plans/2026-03-24-feat-staged-small-model-extraction-mode-plan.md:389-395`
- Acceptance criteria require deterministic compilation, but not the concrete matching rules that make that determinism real: `docs/plans/2026-03-24-feat-staged-small-model-extraction-mode-plan.md:405-406`

## Proposed Solutions

### Option 1: Define a strict v1 policy (normalized exact match only) and document it explicitly
**Pros:** Simple, testable, and aligned with the plan’s reliability-first/YAGNI posture.
**Cons:** Lower recall on variant surface forms.
**Effort:** Small
**Risk:** Low

### Option 2: Define a two-tier policy (exact match first, then conservative alias/mention matching)
**Pros:** Better recall while staying mostly deterministic.
**Cons:** More implementation and more edge cases to test.
**Effort:** Medium
**Risk:** Medium

### Option 3: Leave matching heuristic to implementation
**Pros:** Fastest for the author.
**Cons:** High risk of inconsistent behavior, brittle tests, and scope creep.
**Effort:** Small
**Risk:** High

## Recommended Action
Resolved in the plan. The compiler now has an explicit v1 reconciliation policy: normalized exact-text matching only, preserve the first accepted label, and drop unresolved relationships with warnings.

## Technical Details
- Affected plan sections:
  - deterministic compiler responsibilities
  - spec / flow gap analysis
  - acceptance criteria
  - test scenarios
- Likely implementation files:
  - `packages/graph-extract/src/staged-compile.ts`
  - `packages/graph-extract/test/staged-compile.test.ts`

## Acceptance Criteria
- [ ] The plan defines the v1 entity canonicalization strategy
- [ ] The plan defines how relationship endpoints map to compiled nodes
- [ ] The plan includes acceptance tests for repeated mentions, case differences, and unresolved references

## Work Log
- 2026-03-24: Marked the compiler’s matching policy as the largest unresolved implementation detail in the plan.
- 2026-03-24: Updated the plan to define a strict v1 reconciliation policy based on normalized exact-text matching with warning-based drops for unresolved endpoints.

## Resources
- Plan: `docs/plans/2026-03-24-feat-staged-small-model-extraction-mode-plan.md`
- Brainstorm constraint: reliability first, quality second
