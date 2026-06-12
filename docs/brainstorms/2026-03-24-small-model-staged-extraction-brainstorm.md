---
date: 2026-03-24
topic: small-model-staged-extraction
---

# Small-Model Staged Extraction

## What We're Building
Add an explicit extraction mode switch to `graph-extract` with two supported paths:

- `single`: the current one-shot graph extraction flow, kept intact for larger and more capable models
- `staged`: a small-model-optimized flow that breaks extraction into simpler steps

The staged flow should ask the model to do semantic extraction only. In practice, that means an early pass extracts candidate entities plus grounding snippets or mentions, a later pass extracts relationships over that entity set, and deterministic code handles deduplication, referential integrity, ID assignment, labels, and final graph assembly.

The top-level staged result should still compile down to the same final graph shape the library returns today, while optionally exposing intermediate pass outputs for debugging and evaluation.

## Why This Approach
We considered three directions:

1. Add a focused staged mode beside the current flow, with a light touch of reusable stage primitives
2. Introduce a shared minimal intermediate representation for both single and staged flows
3. Build low-level stage primitives first and compose product-level modes afterward

We chose option 1 with a light touch of 3. It is the most YAGNI-friendly path: it directly targets the current small-model reliability problem without forcing a large architectural refactor first. It also preserves the clean current path for larger models while still creating reusable building blocks for experimentation, debugging, and future training work.

## Key Decisions
- Keep the current single-pass extraction flow for larger models
- Add an explicit mode switch rather than auto-detecting which flow to use
- Optimize staged mode for runtime reliability on small local models first
- Use a very minimal model-facing schema in staged mode
- Make the first staged pass return entities plus grounding snippets or mentions
- Reuse the existing `entityTypes` and `relationTypes` inputs rather than inventing a second ontology system
- Move ID generation, dedupe policy, graph compilation, and referential integrity checks into deterministic code
- Return the same final graph result shape as today, with optional intermediate debug artifacts
- Treat reduced malformed output and reduced looping as the primary v1 success criteria
- Expose a limited set of public low-level helpers: prompt builders, stage runners, and deterministic compile/normalization helpers

## Resolved Questions
- **Should the library stay single-flow only?** No. Keep the existing single-pass flow and add a separate staged mode.
- **Should staged mode be automatic or explicit?** Explicit. Users choose the mode.
- **Should low-level pieces be exposed?** Yes, but lightly. Main API stays simple while advanced users get reusable stage helpers.
- **Should small models emit final graph IDs?** No. The model should avoid IDs entirely.
- **What should pass 1 produce?** Candidate entities plus grounding snippets/mentions.
- **Should staged mode use a reduced ontology?** No. Reuse the same ontology inputs as the current API.
- **Should staged mode return a different result type?** No. Same final graph shape, with optional debug metadata.
- **What matters most for v1?** Reliability first, quality second.

## Open Questions
None for brainstorming. Remaining choices are implementation details for planning.

## Next Steps
→ `/workflows-plan` for implementation details
