---
status: complete
priority: p3
issue_id: "005"
tags: [code-review, cli, quality, planning]
dependencies: []
---

# CLI config layering for `mode` is not decided

## Problem Statement
The repo’s existing CLI pattern prefers layered configuration (CLI args > environment > defaults), but the plan only mentions a `--mode` flag. It does not say whether mode should also be configurable by environment variable or intentionally remain CLI-only.

## Findings
- Institutional learnings call out layered CLI configuration as a pattern worth preserving: `docs/plans/2026-03-24-feat-staged-small-model-extraction-mode-plan.md:68-73`
- The plan adds `--mode single|staged` but does not mention an env var or an explicit decision not to add one: `docs/plans/2026-03-24-feat-staged-small-model-extraction-mode-plan.md:177-189`
- Current CLI provider settings use layered resolution from args and environment: `apps/cli/src/commands/extract.ts:112-156`

## Proposed Solutions

### Option 1: Add `GRAPH_EXTRACT_MODE` and keep the existing layering pattern
**Pros:** Consistent with the rest of the CLI surface.
**Cons:** Slightly larger config surface.
**Effort:** Small
**Risk:** Low

### Option 2: Keep mode CLI-only and document that decision explicitly
**Pros:** Smaller surface area.
**Cons:** Breaks the prevailing pattern unless explained clearly.
**Effort:** Small
**Risk:** Low

### Option 3: Decide later during implementation
**Pros:** No plan changes now.
**Cons:** Encourages ad hoc behavior and docs drift.
**Effort:** Small
**Risk:** Medium

## Recommended Action
Resolved in the plan. CLI mode layering is now explicit: `--mode` > `GRAPH_EXTRACT_MODE` > default `single`.

## Technical Details
- Affected plan sections:
  - CLI section
  - acceptance criteria
  - docs plan
- Likely implementation files:
  - `apps/cli/src/commands/extract.ts`
  - `apps/cli/src/index.ts`
  - `README.md`

## Acceptance Criteria
- [ ] The plan explicitly states whether `mode` participates in env-based CLI config layering
- [ ] If yes, the env var is named in the plan and docs scope
- [ ] If no, the plan states that mode is intentionally CLI-only in v1

## Work Log
- 2026-03-24: Flagged missing configuration decision for CLI/env parity.
- 2026-03-24: Updated the plan to define CLI mode layering as `--mode` > `GRAPH_EXTRACT_MODE` > default `single`.

## Resources
- Plan: `docs/plans/2026-03-24-feat-staged-small-model-extraction-mode-plan.md`
- Existing CLI config resolution: `apps/cli/src/commands/extract.ts`
