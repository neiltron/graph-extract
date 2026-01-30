---
title: "feat: Implement graph-extract library and CLI"
type: feat
date: 2026-01-29
---

# Implement graph-extract Library and CLI

## Overview

Build the complete graph-extract library - an LLM-based entity and relationship extraction tool that outputs JSON graph structures (nodes + edges). Includes the core library package and CLI app for testing, following the comprehensive spec in `docs/spec.md`.

## Problem Statement / Motivation

Need a modular, provider-agnostic library for extracting knowledge graphs from text using LLMs. Designed as an alternative to GLiNER2 for knowledge graph construction pipelines. The library-first approach allows easy integration into larger systems.

## Proposed Solution

Implement the full monorepo as specified:

1. **Core library** (`packages/graph-extract`) - TypeScript library with extraction, validation, and parsing
2. **CLI app** (`apps/cli`) - Command-line interface for testing and standalone use

## Technical Approach

### Technology Stack

- **Runtime:** Bun
- **Language:** TypeScript (ES2022, ESNext modules)
- **Linting/Formatting:** Biome
- **LLM Integration:** OpenAI SDK (OpenAI-compatible APIs)
- **Package Manager:** Bun workspaces

### Architecture

```
graph-extract/
├── package.json              # Workspace root
├── bunfig.toml               # Bun workspace config
├── tsconfig.json             # Root TS config
├── tsconfig.base.json        # Shared compiler options
├── biome.json                # Linting/formatting
├── packages/
│   └── graph-extract/        # Core library (@graph-extract/core)
│       ├── package.json
│       ├── tsconfig.json
│       ├── src/
│       │   ├── index.ts          # Public exports
│       │   ├── types.ts          # Type definitions
│       │   ├── schema.ts         # Schema handling & defaults
│       │   ├── errors.ts         # Error classes
│       │   ├── validate.ts       # Graph validation
│       │   ├── prompt.ts         # Prompt building
│       │   ├── parse.ts          # JSON parsing from LLM response
│       │   ├── extractor.ts      # Extractor class
│       │   └── extract.ts        # Standalone extract function
│       └── test/
│           ├── validate.test.ts
│           ├── parse.test.ts
│           ├── prompt.test.ts
│           └── fixtures/
└── apps/
    └── cli/                      # CLI wrapper (@graph-extract/cli)
        ├── package.json
        ├── tsconfig.json
        └── src/
            ├── index.ts          # Entry point
            ├── commands/
            │   ├── extract.ts    # Main extract command
            │   └── validate.ts   # Validate existing graph
            └── utils/
                └── io.ts         # File/stdin helpers
```

### Implementation Phases

#### Phase 1: Project Setup

- [x] Initialize root `package.json` with Bun workspaces (name: `graph-extract`)
- [x] Create `bunfig.toml` for Bun configuration
- [x] Create `tsconfig.base.json` with shared compiler options
- [x] Create root `tsconfig.json`
- [x] Create `biome.json` for linting/formatting
- [x] Set up directory structure for packages and apps
- [x] Create `packages/graph-extract/package.json`
- [x] Create `packages/graph-extract/tsconfig.json`
- [x] Create `apps/cli/package.json`
- [x] Create `apps/cli/tsconfig.json`

#### Phase 2: Core Library - Types & Schema

- [x] Create `packages/graph-extract/src/types.ts` with all type definitions:
  - Node, Edge, Graph interfaces
  - EntityType, RelationType unions
  - Schema interface
  - ExtractorConfig, ProviderConfig interfaces
  - ExtractionOptions, ExtractionResult interfaces
  - ValidationResult, ValidationError, ValidationWarning interfaces
  - DEFAULT_ENTITY_TYPES, DEFAULT_RELATION_TYPES constants
- [x] Create `packages/graph-extract/src/schema.ts` with schema utilities
- [x] Create `packages/graph-extract/src/errors.ts` with error classes:
  - GraphExtractError (base)
  - ParseError
  - ProviderError

#### Phase 3: Core Library - Validation

- [x] Create `packages/graph-extract/src/validate.ts`:
  - Check nodes have IDs
  - Check for duplicate IDs
  - Check edges reference valid nodes
  - Return cleaned graph with invalid edges removed
  - Return errors and warnings
- [x] Create `packages/graph-extract/test/validate.test.ts`

#### Phase 4: Core Library - Prompt & Parse

- [x] Create `packages/graph-extract/src/prompt.ts`:
  - `buildPrompt(text, schema)` function
  - Include entity types, relation types, instructions
  - Clear JSON output format instructions
- [x] Create `packages/graph-extract/src/parse.ts`:
  - Parse JSON from LLM response
  - Handle markdown code blocks
  - Handle malformed JSON gracefully
- [x] Create `packages/graph-extract/test/prompt.test.ts`
- [x] Create `packages/graph-extract/test/parse.test.ts`
- [x] Create test fixtures in `packages/graph-extract/test/fixtures/`

#### Phase 5: Core Library - Extractor

- [x] Create `packages/graph-extract/src/extractor.ts`:
  - `Extractor` class with `extract(text, options?)` method
  - Provider configuration and OpenAI SDK integration
  - Retry logic on parse failures
  - Return ExtractionResult with graph, warnings, raw, usage
- [x] Create `packages/graph-extract/src/extract.ts`:
  - Simple `extract(text, config)` function wrapper
  - `createExtractor(config)` factory function
- [x] Create `packages/graph-extract/src/index.ts`:
  - Export all public API: extract, createExtractor, validate, types

#### Phase 6: CLI Application

- [x] Create `apps/cli/src/utils/io.ts`:
  - `readInput(path?)` - read from file or stdin
  - `writeOutput(data, path?)` - write to file or stdout
  - `readSchema(path)` - parse schema JSON file
- [x] Create `apps/cli/src/commands/extract.ts`:
  - Parse CLI arguments (input, output, schema, provider, model, etc.)
  - Call core library extract function
  - Format and output results
- [x] Create `apps/cli/src/commands/validate.ts`:
  - Read existing graph JSON
  - Run validation
  - Output results with errors/warnings
- [x] Create `apps/cli/src/index.ts`:
  - CLI entry point with argument parsing
  - Route to appropriate command
  - Handle --help, --version

#### Phase 7: Testing & Polish

- [x] Add integration test with mock LLM responses
- [x] Verify all tests pass with `bun test`
- [x] Run `bun run lint` and fix any issues
- [x] Run `bun run typecheck` and fix any issues
- [x] Run `bun run build` to verify builds work
- [x] Test CLI manually with sample input
- [x] Add README.md to root with quick start guide

## Acceptance Criteria

### Functional Requirements

- [x] `extract(text, config)` returns a valid Graph with nodes and edges
- [x] `createExtractor(config)` returns reusable Extractor instance
- [x] `validate(graph)` returns ValidationResult with errors, warnings, cleaned graph
- [x] CLI reads from stdin or file, outputs to stdout or file
- [x] CLI supports `--provider`, `--model`, `--base-url` for LLM config
- [x] CLI supports `--schema` for custom entity/relation types
- [x] CLI `validate` subcommand validates existing graph files
- [x] Works with LM Studio, OpenAI, and other OpenAI-compatible APIs

### Non-Functional Requirements

- [x] TypeScript strict mode passes
- [x] Biome linting passes
- [x] All tests pass
- [x] Exported types are properly documented
- [x] Error messages are clear and actionable

## Key Files Reference

From the spec, key implementation details:

- **Types:** See spec lines 76-263 for complete type definitions
- **Prompt Template:** See spec lines 366-401 for exact prompt format
- **Validation Logic:** See spec lines 411-497 for implementation
- **CLI Interface:** See spec lines 504-555 for arguments and usage
- **Package Configs:** See spec lines 578-695 for all package.json and configs

## Environment Variables

```bash
# Provider defaults
GRAPH_EXTRACT_PROVIDER=lmstudio
GRAPH_EXTRACT_BASE_URL=http://localhost:1234/v1
GRAPH_EXTRACT_MODEL=local-model

# API keys (for cloud providers)
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
```

## Dependencies

### Core Library

```json
{
  "dependencies": {
    "openai": "^4.70.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0"
  }
}
```

### CLI

```json
{
  "dependencies": {
    "@graph-extract/core": "workspace:*"
  }
}
```

### Root

```json
{
  "devDependencies": {
    "@biomejs/biome": "^1.9.0",
    "@types/bun": "latest",
    "typescript": "^5.7.0"
  }
}
```

## Success Metrics

- Library can extract entities and relationships from text via any OpenAI-compatible LLM
- CLI provides quick iteration for testing extraction quality
- Clean separation between core library and CLI allows easy reuse
- Type-safe API with good developer experience

## Design Decisions

Based on SpecFlow analysis, these decisions address identified gaps:

### Input Handling

| Decision | Behavior |
|----------|----------|
| Empty text input | Throw `GraphExtractError` with "Input text cannot be empty" |
| Text size limits | No hard limit in v1; trust LLM context window errors |
| Stdin timeout (CLI) | No timeout; wait indefinitely (standard Unix behavior) |

### JSON Parsing

| Decision | Behavior |
|----------|----------|
| Markdown code fences | Strip ` ```json ` and ` ``` ` before parsing |
| Trailing commas | Use lenient parsing to handle |
| Non-JSON response | Retry with same prompt |
| Missing nodes/edges array | Default to empty array `[]` |
| Numeric IDs | Coerce to strings (`{id: 1}` → `{id: "1"}`) |
| Extra fields in response | Strip unknown fields (keep schema clean) |

### Retry Logic

| Decision | Behavior |
|----------|----------|
| Retry trigger | Parse failures only (not validation warnings) |
| Retry prompt | Same prompt, no modification |
| Retry delay | None (immediate retry) |
| After all retries exhausted | Throw `ParseError` with raw response attached |

### Validation Rules

| Decision | Behavior |
|----------|----------|
| Self-referencing edges | Valid (no warning) |
| Duplicate edges | Valid (no deduplication) |
| Node without label | Warning, keep node |
| Node without type | Warning, default to `'other'` |
| Edge without type/label | Warning, default to `'related_to'` |
| ID case sensitivity | Case-sensitive (exact match) |
| Schema type enforcement | No enforcement; types are suggestions to LLM |

### CLI Behavior

| Decision | Behavior |
|----------|----------|
| Exit codes | 0=success, 1=extraction error, 2=validation error (validate cmd), 3=file I/O error, 4=config error |
| Warnings | Output to stderr |
| JSON output | Only to stdout |
| Output file exists | Overwrite silently (Unix convention) |
| `--pretty` flag | Pretty-print JSON with 2-space indent |
| stdin + -i conflict | Prefer -i flag, ignore stdin |

### Configuration Precedence

CLI flags > Environment variables > Defaults

### Timeouts

| Decision | Value |
|----------|-------|
| LLM request timeout | 60 seconds (default) |
| Configurable | Not in v1 |

### Security

| Decision | Behavior |
|----------|----------|
| API key in errors | Never expose; mask in all outputs |
| Prompt injection | No sanitization (out of scope for v1) |

## References

- Specification: `docs/spec.md`
- OpenAI SDK: https://github.com/openai/openai-node
- Biome: https://biomejs.dev/
- Bun Workspaces: https://bun.sh/docs/install/workspaces
