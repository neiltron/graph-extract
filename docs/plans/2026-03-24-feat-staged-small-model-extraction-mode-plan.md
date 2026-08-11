---
title: "feat: Add staged extraction mode for small models"
type: feat
status: completed
date: 2026-03-24
origin: docs/brainstorms/2026-03-24-small-model-staged-extraction-brainstorm.md
---

# feat: Add staged extraction mode for small models

## Overview
Found brainstorm from 2026-03-24: `small-model-staged-extraction`. Using it as the foundation for this plan.

Add an explicit extraction mode switch to `graph-extract`:
- `single` keeps the current one-shot path
- `staged` uses smaller semantic passes for weaker models

The staged path should still return the existing validated `ExtractionResult`, but shift ID generation, deduplication, referential integrity, and final graph assembly into deterministic code (see brainstorm: `docs/brainstorms/2026-03-24-small-model-staged-extraction-brainstorm.md`).

This is a reliability-first feature. The goal is to reduce malformed output, looping, and prompt overload on small local models without introducing a second ontology system or a broad refactor in v1.

## Problem Statement
The current extraction flow asks one model call to do too much at once:

- semantic extraction
- ontology classification
- final JSON formatting
- sequential ID generation
- edge referential integrity
- salience trimming via limits

Today that all happens in the main extractor path: `Extractor.extract()` builds a single prompt, calls the LLM once, parses the returned graph JSON, and validates it (`packages/graph-extract/src/extractor.ts:36-62`). The prompt itself explicitly asks the model to emit final graph IDs and references (`packages/graph-extract/src/prompt.ts:6-42`).

That design works reasonably well for stronger models, but it is a poor fit for smaller local models. The repo’s own research already points in this direction: `docs/small-llm-training-feasibility.md` recommends simpler model-facing schemas and multi-pass extraction for weaker models, and `docs/spec.md` lists multiple extraction passes as future work.

## Research Summary

### Origin Brainstorm
The brainstorm established the following requirements and constraints, all carried forward here:

- keep the existing single-pass flow for larger models
- add an explicit mode switch instead of auto-detection
- optimize staged mode for runtime reliability first
- use a very minimal model-facing schema in staged mode
- make pass 1 return entities plus grounding snippets/mentions
- reuse the existing `entityTypes` and `relationTypes` inputs
- move IDs, dedupe, graph compilation, and referential integrity into deterministic code
- return the same final graph result shape, with optional intermediate debug artifacts
- expose a light set of reusable low-level helpers

All of these come directly from the brainstorm and should remain in scope for implementation (see brainstorm: `docs/brainstorms/2026-03-24-small-model-staged-extraction-brainstorm.md`).

### Local Repository Research
Relevant local patterns:

- **Single extraction pipeline already exists and is centralized** in `packages/graph-extract/src/extractor.ts:36-62`
- **Prompt generation is isolated** in `packages/graph-extract/src/prompt.ts:6-45`
- **Public API exports are centralized** in `packages/graph-extract/src/index.ts:2-32`
- **Schema/config handling already supports option expansion** in `packages/graph-extract/src/types.ts:62-76` and `packages/graph-extract/src/schema.ts`
- **CLI extraction options are centralized** in `apps/cli/src/commands/extract.ts:12-213`
- **CLI help and arg parsing are centralized** in `apps/cli/src/index.ts:18-30` and `apps/cli/src/index.ts:167-186`
- **Structured output and size limits are already supported** through `responseFormat`, `maxNodes`, and `maxEdges` (`packages/graph-extract/src/extractor.ts:113-290`, `apps/cli/src/commands/extract.ts:145-209`)

### Institutional Learnings
`docs/solutions/feature-implementations/llm-graph-extraction-library.md` highlights a few patterns that should remain intact:

- keep provider calls provider-agnostic and routed through the existing OpenAI-compatible client
- keep parsing defensive and tolerant of malformed responses
- keep validation deterministic and separate from model behavior
- keep CLI configuration layered: CLI args > environment > defaults

These patterns argue for adding staged extraction as an additional orchestration path, not as a rewrite of parse/validate/provider code.

### External Research Decision
External research was skipped. The problem is low-risk, the repo already has strong local context, and the brainstorm gives clear product direction. The most important work here is aligning with existing package and CLI patterns rather than bringing in new external guidance.

## Proposed Solution
Add a mode-aware extraction architecture with one preserved path and one new path:

### Mode A: `single`
Keep the current implementation as the default backward-compatible behavior: one prompt, one LLM call, then `parseGraph()` and `validate()` over final graph JSON.

### Mode B: `staged`
Add a small-model-oriented path with at least two semantic passes:
1. **Entity pass**: extract candidate entities plus grounding snippets or mentions
2. **Relationship pass**: extract relationships over that entity set
3. **Deterministic compile step**: dedupe entities, assign IDs, normalize labels, drop dangling references, then validate the compiled graph

This shifts the model’s job from “emit the finished graph object” to “return minimal semantic facts” (see brainstorm: `docs/brainstorms/2026-03-24-small-model-staged-extraction-brainstorm.md`).

### Public Surface
Keep the top-level API simple: library callers choose `single` or `staged`, and CLI users pass the matching mode flag. Expose a light set of low-level helpers for advanced usage: staged prompt builders, stage runners, and deterministic compile/normalization helpers.

## Technical Approach

### Architecture

#### 1. Extend config and result types
Add mode-aware extraction options in the core types layer.

**Files:**
- `packages/graph-extract/src/types.ts`
- `packages/graph-extract/src/schema.ts`
- `packages/graph-extract/src/extract.ts`
- `packages/graph-extract/src/index.ts`

Planned additions:
- `ExtractorConfig.mode?: 'single' | 'staged'` as the default mode for an extractor instance or one-shot `extract(text, config)` call
- `ExtractionOptions.mode?: 'single' | 'staged'` as an optional per-call override
- optional staged debug output flag or equivalent opt-in control
- optional staged debug payload on `ExtractionResult`

`index.ts` should only re-export the updated types and helpers. The default must remain `single` for backward compatibility.

#### 2. Keep the current one-shot prompt path intact
Do not regress the existing single-pass flow. The current prompt builder and parser remain the source of truth for final-schema extraction in `single` mode.

**Files:**
- `packages/graph-extract/src/prompt.ts`
- `packages/graph-extract/src/extractor.ts`

#### 3. Introduce staged prompt builders and stage result types
Create dedicated prompt builders for the smaller semantic tasks rather than overloading `buildPrompt()` with branching complexity.

**New files to consider:**
- `packages/graph-extract/src/staged-prompt.ts`
- `packages/graph-extract/src/staged-types.ts`
- `packages/graph-extract/src/staged-parse.ts`

Recommended stage-level shapes:
- entity stage output: entity text, type, mention/snippet
- relationship stage output: source text, target text, relation type, optional support snippet

These outputs should avoid synthetic IDs entirely.

#### 4. Add deterministic graph compilation
Compile staged semantic outputs into the existing `Graph` shape in code.

**New file to consider:**
- `packages/graph-extract/src/staged-compile.ts`

Responsibilities:
- run a deterministic reconciliation step over extracted entities
- canonicalize/dedupe entity mentions by normalized exact-text matching (`trim` + lowercase)
- preserve the first accepted surface form as the final node label
- create stable sequential `node_*` and `edge_*` IDs
- map relationship endpoints to compiled node IDs through the reconciled entity map
- drop unresolved relationships with warnings rather than guessing
- generate edge labels from relation types when needed
- run the existing `validate()` pass on the final compiled graph

v1 should intentionally avoid fuzzy matching. This is the heart of the reliability improvement because it removes referential bookkeeping from the model and keeps reconciliation deterministic.

#### 5. Add staged orchestration inside `Extractor`
`Extractor.extract()` should branch on mode and delegate to either:
- current single-pass execution
- new staged execution

**File:**
- `packages/graph-extract/src/extractor.ts`

The staged path should reuse existing provider logic, stop sequences, retry behavior, and usage accounting where practical. `responseFormat` should remain JSON-oriented in both modes: `json_object` should continue to request JSON objects, while `json_schema` should apply stage-specific schemas in staged mode rather than the final graph schema.

#### 6. Thread mode through the CLI
Expose staged extraction via CLI without disturbing existing usage.

**Files:**
- `apps/cli/src/commands/extract.ts`
- `apps/cli/src/index.ts`
- `README.md`

Add a new flag such as:
- `--mode single`
- `--mode staged`

Mode should follow the existing CLI layering pattern: `--mode` > `GRAPH_EXTRACT_MODE` > default `single`. CLI defaults should preserve current behavior.

#### 7. Add low-level exports carefully
Expose only the helpers needed for experimentation and testing in v1.

**File:**
- `packages/graph-extract/src/index.ts`

Examples:
- `buildEntityPrompt(...)`
- `buildRelationshipPrompt(...)`
- `extractEntities(...)`
- `extractRelationships(...)`
- `compileGraph(...)`

Keep the top-level `extract()` API as the default happy path.

### Pseudo API Sketch

#### `packages/graph-extract/src/types.ts`
```ts
export type ExtractionMode = 'single' | 'staged';

export interface ExtractorConfig {
  provider: ProviderConfig;
  schema?: Schema;
  mode?: ExtractionMode; // default: 'single'
  temperature?: number;
  maxTokens?: number;
  maxRetries?: number;
}

export interface ExtractionOptions {
  schema?: Schema;
  temperature?: number;
  mode?: ExtractionMode; // optional per-call override
  includeDebugArtifacts?: boolean;
}

export interface ExtractionResult {
  graph: Graph;
  warnings: ValidationWarning[];
  raw: string; // in staged mode, the final stage raw response
  usage?: {
    inputTokens: number; // summed across all stages
    outputTokens: number; // summed across all stages
  };
  debug?: {
    mode: ExtractionMode;
    stages?: Array<{
      name: 'entity' | 'relationship';
      raw: string;
      usage?: {
        inputTokens: number;
        outputTokens: number;
      };
    }>;
    compiled?: unknown;
  };
}
```

#### `packages/graph-extract/src/staged-compile.ts`
```ts
export function compileGraphFromStages(input: {
  entities: Array<{ text: string; type: string; mention?: string }>;
  relationships: Array<{ source: string; target: string; type: string; mention?: string }>;
}): Graph {
  // dedupe entity names
  // assign node IDs
  // map relationship endpoints to node IDs
  // create edge IDs and labels
  // return final graph
}
```

## Implementation Phases

### Phase 1: API and config foundation
**Goal:** Add the smallest possible mode-aware surface without changing current behavior.

**Tasks**
- [x] Update `packages/graph-extract/src/types.ts` so `ExtractorConfig` can hold the default mode and `ExtractionOptions` can optionally override it per call
- [x] Update `packages/graph-extract/src/extract.ts` so the convenience helper supports mode-aware configs
- [x] Update `packages/graph-extract/src/index.ts` exports for any new public staged helpers
- [x] Update `apps/cli/src/commands/extract.ts` to accept and validate a mode option and support `GRAPH_EXTRACT_MODE`
- [x] Update `apps/cli/src/index.ts` help text and argument parsing for `--mode`
- [x] Preserve `single` as the default everywhere

**Success criteria**
- The current library and CLI behavior remains unchanged when mode is omitted
- A clear, explicit mode switch exists in both library and CLI

### Phase 2: Staged extraction internals
**Goal:** Implement the new orchestration path without rewriting single-pass extraction.

**Tasks**
- [x] Add staged prompt builder file(s), such as `packages/graph-extract/src/staged-prompt.ts`
- [x] Add stage output parsing helpers, such as `packages/graph-extract/src/staged-parse.ts`
- [x] Add deterministic compiler logic in `packages/graph-extract/src/staged-compile.ts`
- [x] Implement a strict v1 reconciliation policy in the compiler: normalized exact-text matching only, no fuzzy matching
- [x] Branch `packages/graph-extract/src/extractor.ts` on mode and orchestrate the two passes
- [x] Annotate errors with stage context so failures are debuggable
- [x] Apply `responseFormat=json_object` or stage-specific `json_schema` behavior consistently across staged passes
- [x] Keep ontology inputs (`entityTypes`, `relationTypes`) shared across both modes

**Success criteria**
- `staged` mode performs at least two model-facing passes
- Staged prompts do not require model-generated node or edge IDs
- The final staged result compiles into the existing validated `Graph` shape

### Phase 3: Debug artifacts, tests, and docs
**Goal:** Make staged mode usable, testable, and understandable.

**Tasks**
- [x] Add optional debug artifacts to `ExtractionResult` when explicitly requested, including per-stage raw outputs and per-stage usage
- [x] Define top-level staged result semantics: `raw` is the final stage raw response and `usage` is aggregated across stages
- [x] Add extractor tests in `packages/graph-extract/test/extract.test.ts`
- [x] Add staged prompt tests in a new file such as `packages/graph-extract/test/staged-prompt.test.ts`
- [x] Add compiler tests in a new file such as `packages/graph-extract/test/staged-compile.test.ts`
- [x] Add CLI tests in `apps/cli/src/commands/extract.test.ts`
- [x] Update `README.md` examples for mode selection and `GRAPH_EXTRACT_MODE`
- [x] Update `docs/spec.md` to document both flows and staged-mode response-format behavior

**Success criteria**
- The staged path is documented and covered by focused tests
- Default output stays simple; intermediate artifacts are opt-in

## Alternative Approaches Considered

### 1. Shared minimal intermediate representation for all modes
Rejected for now. It is architecturally cleaner, but a bigger refactor than v1 needs.

### 2. Build stage primitives first and define product-level modes later
Rejected for now. It is flexible, but weaker as a first user-facing step than adding an explicit top-level mode switch.

## System-Wide Impact

### Interaction Graph
Current flow:
- caller or CLI runs `extract(...)`
- `Extractor.extract()` builds one prompt
- `callLLM()` sends one request
- `parseGraph()` parses final JSON
- `validate()` cleans the graph

Planned staged flow:
- caller or CLI runs `extract(..., { mode: 'staged' })`
- `Extractor.extract()` branches into staged orchestration
- entity prompt builder creates entity extraction prompt
- `callLLM()` sends entity-stage request
- stage parser normalizes entity-stage output
- relationship prompt builder creates relationship extraction prompt using entity results
- `callLLM()` sends relationship-stage request
- stage parser normalizes relationship-stage output
- deterministic compiler builds final graph
- existing `validate()` runs on compiled graph

This change should be additive. The existing parsing and validation utilities remain in the graph-finalization segment of the system rather than being replaced.

### Error & Failure Propagation
Expected failure classes remain the same at the top level:
- `ProviderError` for request failures
- `ParseError` for malformed model output
- `GraphExtractError` for config/input problems

Staged mode adds two requirements: failures should identify which stage failed, and result metadata should stay predictable across multiple LLM calls. A parse failure in the entity pass and a parse failure in the relationship pass should not look identical in logs or test output.

If stage 1 fails, extraction should fail fast. If stage 2 fails, extraction should also fail, unless the implementation explicitly decides to surface a partial debug artifact in memory only. The public success path should never return a half-compiled graph.

For staged successes, `ExtractionResult.raw` should contain the final stage raw response for backward compatibility, while `ExtractionResult.usage` should aggregate token counts across all stages. Detailed per-stage raw payloads and usage should live under opt-in debug artifacts only.

### State Lifecycle Risks
There is no database or durable state involved, which keeps risk low. The main lifecycle risk is inconsistent in-memory assembly:
- duplicate entities creating duplicate compiled nodes
- relationship endpoints that do not map back to compiled nodes
- stale or misleading debug artifacts if compile fails after successful stage calls

Mitigation:
- compile through a single deterministic function
- run `validate()` after compilation
- only attach debug artifacts when explicitly requested
- do not persist or emit partial compiled results as successful output

### API Surface Parity
All user-facing entry points that expose extraction should stay aligned:
- `extract()` convenience function
- `createExtractor()` / `Extractor.extract()`
- CLI extract command in `apps/cli/src/commands/extract.ts`
- CLI help text in `apps/cli/src/index.ts`
- README usage examples
- `docs/spec.md`

Low-level staged helpers may be added, but they should not bypass the main shared normalization and compile logic.

### Integration Test Scenarios
These scenarios need coverage because unit tests alone will miss cross-layer regressions:

1. **CLI staged mode with schema file**
   - `apps/cli/src/commands/extract.test.ts`
   - Verifies mode parsing, schema propagation, and graph output formatting together

2. **Staged mode with no relationships present**
   - `packages/graph-extract/test/extract.test.ts`
   - Ensures empty relationship arrays compile to valid graphs rather than parse failures or hallucinated edges

3. **Relationship stage references an unknown entity**
   - `packages/graph-extract/test/staged-compile.test.ts`
   - Ensures unresolved endpoints are warned/dropped deterministically

4. **Single mode remains byte-for-byte compatible in behavior where possible**
   - `packages/graph-extract/test/extract.test.ts`
   - Ensures the new mode branch does not regress existing output paths

5. **Debug artifacts opt-in only**
   - `packages/graph-extract/test/extract.test.ts`
   - Ensures staged intermediate data does not appear unless explicitly requested

## Spec / Flow Gap Analysis
Manual spec-flow review surfaced the following areas that the implementation must address:

- **No-relations path:** staged mode must succeed when entity extraction is non-empty but no explicit relationships exist
- **Duplicate mention path:** repeated mentions of the same real-world entity must converge in compilation
- **Ontology mismatch path:** staged prompts must still respect user-provided `entityTypes` and `relationTypes`
- **Reference mismatch path:** v1 should use a strict reconciliation rule — normalized exact-text matching only — and drop unresolved relationships with warnings rather than guessing
- **Debug payload shape:** opt-in debug output must be useful enough for evaluation, but not so large or unstable that it becomes the primary API by accident
- **Response-format path:** staged mode must document how `json_object` and stage-specific `json_schema` behave across both passes

These are not open product questions; they are planning requirements.

## Acceptance Criteria

### Functional Requirements
- [x] `packages/graph-extract/src/types.ts` supports an explicit extraction mode with `single` as the default
- [x] `ExtractorConfig` can set the default extraction mode and `ExtractionOptions` can optionally override it per call
- [x] `packages/graph-extract/src/extract.ts` supports staged mode through the one-shot convenience helper
- [x] `packages/graph-extract/src/extractor.ts` preserves the current single-pass flow unchanged when mode is `single` or omitted
- [x] `packages/graph-extract/src/extractor.ts` supports a `staged` path with at least two passes: entities+mentions, then relationships
- [x] Staged mode reuses the existing `entityTypes` and `relationTypes` inputs rather than creating a separate ontology config (see brainstorm: `docs/brainstorms/2026-03-24-small-model-staged-extraction-brainstorm.md`)
- [x] Staged model-facing outputs do not require node IDs or edge IDs from the model (see brainstorm: same file)
- [x] Deterministic compilation produces the existing final `Graph` shape with sequential node/edge IDs through a reconciliation step based on normalized exact-text matching
- [x] Final staged results pass through existing validation logic before being returned
- [x] In staged mode, `ExtractionResult.raw` contains the final stage raw response and `usage` aggregates token counts across stages
- [x] `ExtractionResult` can optionally include intermediate debug artifacts without changing the default consumer experience
- [x] `responseFormat` remains JSON-oriented in both modes; staged mode supports `json_object` and uses stage-specific schemas for `json_schema`
- [x] `apps/cli/src/index.ts` and `apps/cli/src/commands/extract.ts` expose a mode flag for staged extraction
- [x] CLI mode resolution follows `--mode` > `GRAPH_EXTRACT_MODE` > default `single`
- [x] `README.md` and `docs/spec.md` document both modes and their intended use cases

### Non-Functional Requirements
- [x] Backward compatibility is preserved for existing callers that do not opt into staged mode
- [x] Reliability improvements are prioritized over recall improvements in staged mode (see brainstorm: same file)
- [x] The implementation avoids a broad refactor of parse/validate/provider layers in v1
- [x] Default output size and API complexity remain close to the current library experience

### Quality Gates
- [x] Existing tests for single-pass extraction continue to pass
- [x] New staged-path tests cover success, empty-relationship, duplicate-entity, unresolved-endpoint, case-normalization, and debug-artifact cases
- [x] CLI tests cover mode parsing, `GRAPH_EXTRACT_MODE`, and validation behavior
- [x] Public exports and README examples match the implemented surface area

## Success Metrics
- Lower rate of malformed or looping responses when using small models in staged mode
- High rate of valid final graph outputs from staged mode on the same small-model inputs that currently fail in single mode
- No regressions in existing single-pass tests or documented examples
- Smaller burden on the model: no model-generated IDs and fewer graph-integrity constraints in prompts

## Dependencies & Prerequisites
- Existing extractor/provider infrastructure in `packages/graph-extract/src/extractor.ts`
- Existing graph validation in `packages/graph-extract/src/validate.ts`
- Existing CLI config layering in `apps/cli/src/commands/extract.ts`
- Existing response format support (`json_object` / `json_schema`) should remain available in both modes; staged mode should apply stage-specific schemas when `json_schema` is selected

No new database, service, or external dependency is required for v1.

## Risk Analysis & Mitigation
- **Staged mode balloons into a second system** → keep `single` intact, add one orchestrated branch, and share provider/validation infrastructure.
- **Debug artifacts become unstable public API** → keep them opt-in and document them as debugging aids, not the main contract.
- **Relationship endpoints fail to map cleanly to compiled nodes** → centralize endpoint matching and test unresolved-reference behavior explicitly.
- **Mode support regresses CLI simplicity** → default to `single`, add one explicit flag, and keep current examples working as-is.
- **Staged mode overfits one local model family** → keep prompts generic and schema-driven rather than model-name-driven.

## Documentation Plan
- Update `README.md` with:
  - when to use `single`
  - when to use `staged`
  - a small-model-oriented example
  - `GRAPH_EXTRACT_MODE`
  - staged-mode `responseFormat` behavior
- Update `docs/spec.md` to describe both extraction architectures
- Document any new public staged helpers in package-level exports
- If debug artifacts are exposed publicly, document their shape and opt-in nature clearly

## Future Considerations
Out of scope for this plan, but naturally enabled by it:
- a shared internal minimal extraction IR for both modes
- training/eval pipelines that reuse staged outputs
- optional fallback from single → staged on failure
- additional stage-specific prompts for recall improvement
- CLI support for writing intermediate stage artifacts to disk

## Sources & References

### Origin
- **Brainstorm document:** `docs/brainstorms/2026-03-24-small-model-staged-extraction-brainstorm.md`
  - Carried-forward decisions:
    - keep `single` for large models and add explicit `staged`
    - use minimal model-facing outputs with deterministic graph assembly
    - expose a light set of prompt/stage/compile helpers

### Internal References
- Existing extractor flow: `packages/graph-extract/src/extractor.ts:36-62`
- Existing structured-output wiring: `packages/graph-extract/src/extractor.ts:113-290`
- Existing one-shot prompt constraints: `packages/graph-extract/src/prompt.ts:6-42`
- Public export surface: `packages/graph-extract/src/index.ts:2-32`
- Schema/config shape: `packages/graph-extract/src/types.ts:62-76`
- CLI extraction configuration: `apps/cli/src/commands/extract.ts:12-213`
- CLI help and option parsing: `apps/cli/src/index.ts:18-30`, `apps/cli/src/index.ts:167-186`
- Existing tests for structured output and limits:
  - `packages/graph-extract/test/extract.test.ts:97`
  - `packages/graph-extract/test/extract.test.ts:210`
  - `packages/graph-extract/test/prompt.test.ts:75`
  - `apps/cli/src/commands/extract.test.ts:92`

### Institutional Learnings
- `docs/solutions/feature-implementations/llm-graph-extraction-library.md`
- `docs/small-llm-training-feasibility.md`

### External References
- None used; local repository context was sufficient for this planning pass.
