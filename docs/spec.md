# graph-extract Monorepo Spec

## Overview

LLM-based entity and relationship extraction library that outputs JSON graph structures (nodes + edges). Designed as a modular alternative to GLiNER2 for knowledge graph construction pipelines.

## Goals

1. **Library-first** - Core extraction logic as a standalone package
2. **CLI for testing** - Quick iteration without building full apps
3. **Pluggable** - Easy to swap into larger pipelines later
4. **Provider-agnostic** - Works with any LLM via pi-ai (LM Studio, OpenAI, Anthropic, Ollama, etc.)

## Non-Goals (for now)

- Streaming partial results
- Batching/chunking long documents
- Web UI (future: apps/web with XYFlow)
- Graph merging utilities
- Database adapters

---

## Structure

```
graph-extract/
├── package.json              # Workspace root
├── bunfig.toml               # Bun workspace config
├── tsconfig.json             # Base TS config
├── tsconfig.base.json        # Shared compiler options
├── biome.json                # Linting/formatting
├── README.md
├── LICENSE
│
├── packages/
│   └── graph-extract/        # Core library
│       ├── package.json
│       ├── tsconfig.json
│       ├── README.md
│       ├── src/
│       │   ├── index.ts          # Public exports
│       │   ├── extractor.ts      # Extractor class
│       │   ├── extract.ts        # Standalone extract function
│       │   ├── prompt.ts         # Prompt building
│       │   ├── parse.ts          # JSON parsing from LLM response
│       │   ├── validate.ts       # Graph validation
│       │   ├── schema.ts         # Schema handling & defaults
│       │   └── types.ts          # Type definitions
│       └── test/
│           ├── extract.test.ts
│           ├── validate.test.ts
│           ├── parse.test.ts
│           └── fixtures/
│               ├── sample-input.txt
│               └── expected-output.json
│
└── apps/
    └── cli/                      # CLI wrapper for testing
        ├── package.json
        ├── tsconfig.json
        ├── README.md
        └── src/
            ├── index.ts          # Entry point
            ├── commands/
            │   ├── extract.ts    # Main extract command
            │   └── validate.ts   # Validate existing graph
            └── utils/
                └── io.ts         # File/stdin helpers
```

---

## Types

```typescript
// packages/graph-extract/src/types.ts

// ============================================================================
// Core Graph Types
// ============================================================================

export interface Node {
  id: string;
  label: string;
  type: EntityType;
  metadata?: Record<string, unknown>;
}

export interface Edge {
  id: string;
  source: string;
  target: string;
  type: string;
  label: string;
  metadata?: Record<string, unknown>;
}

export interface Graph {
  nodes: Node[];
  edges: Edge[];
}

// ============================================================================
// Entity & Relation Types
// ============================================================================

export type EntityType =
  | 'person'
  | 'organization'
  | 'location'
  | 'date'
  | 'product'
  | 'event'
  | 'concept'
  | 'other'
  | (string & {}); // Allow custom types while preserving autocomplete

export type RelationType =
  | 'works_for'
  | 'founded'
  | 'acquired'
  | 'located_in'
  | 'born_in'
  | 'died_in'
  | 'married_to'
  | 'subsidiary_of'
  | 'created'
  | 'member_of'
  | 'produced_by'
  | 'part_of'
  | 'owns'
  | 'related_to'
  | (string & {}); // Allow custom types

// ============================================================================
// Schema Types
// ============================================================================

export interface Schema {
  /** Entity types to extract. Uses defaults if not provided. */
  entityTypes?: string[];
  
  /** Relation types to extract. Uses defaults if not provided. */
  relationTypes?: string[];
  
  /** Additional instructions to include in the prompt. */
  instructions?: string;
}

export const DEFAULT_ENTITY_TYPES: EntityType[] = [
  'person',
  'organization',
  'location',
  'date',
  'product',
  'event',
  'concept',
  'other',
];

export const DEFAULT_RELATION_TYPES: RelationType[] = [
  'works_for',
  'founded',
  'acquired',
  'located_in',
  'born_in',
  'died_in',
  'married_to',
  'subsidiary_of',
  'created',
  'member_of',
  'produced_by',
  'part_of',
  'owns',
  'related_to',
];

// ============================================================================
// Extraction Types
// ============================================================================

export type ExtractionMode = 'single' | 'staged';

export interface ExtractorConfig {
  /** pi-ai provider configuration */
  provider: ProviderConfig;
  
  /** Default schema for all extractions */
  schema?: Schema;
  
  /** Extraction mode (default: single) */
  mode?: ExtractionMode;
  
  /** Temperature for LLM (default: 0) */
  temperature?: number;
  
  /** Max tokens for response (default: 4096) */
  maxTokens?: number;
  
  /** Number of retries on parse failure (default: 2) */
  maxRetries?: number;
}

export interface ProviderConfig {
  /** Provider type or base URL for OpenAI-compatible APIs */
  type: 'lmstudio' | 'openai' | 'anthropic' | 'ollama' | string;
  
  /** Base URL (required for lmstudio, optional for others) */
  baseUrl?: string;
  
  /** Model identifier */
  model: string;
  
  /** API key (not needed for local providers like LM Studio) */
  apiKey?: string;
}

export interface ExtractionOptions {
  /** Override schema for this extraction */
  schema?: Schema;
  
  /** Override extraction mode for this extraction */
  mode?: ExtractionMode;
  
  /** Include stage-level debug artifacts in the result */
  includeDebugArtifacts?: boolean;
  
  /** Override temperature for this extraction */
  temperature?: number;
}

export interface ExtractionResult {
  /** The extracted graph */
  graph: Graph;
  
  /** Validation warnings (e.g., removed invalid edges) */
  warnings: ValidationWarning[];
  
  /** Raw LLM response for debugging. In staged mode this is the final stage raw response. */
  raw: string;
  
  /** Token usage if available. In staged mode this aggregates all stage calls. */
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
  
  /** Optional staged debug artifacts */
  debug?: {
    mode: ExtractionMode;
    stages?: Array<{ name: 'entity' | 'relationship'; raw: string }>;
    compiled?: unknown;
  };
}

// ============================================================================
// Validation Types
// ============================================================================

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  /** Cleaned graph with invalid edges removed */
  graph: Graph;
}

export interface ValidationError {
  type: 'missing_node_id' | 'missing_edge_id' | 'duplicate_id' | 'parse_error';
  message: string;
  details?: Record<string, unknown>;
}

export interface ValidationWarning {
  type: 'invalid_edge_source' | 'invalid_edge_target' | 'removed_edge';
  message: string;
  edgeId?: string;
  details?: Record<string, unknown>;
}
```

---

## Library API

### Simple Usage

```typescript
import { extract } from '@graph-extract/core';

const result = await extract('Steve Jobs founded Apple in 1976.', {
  provider: {
    type: 'lmstudio',
    baseUrl: 'http://localhost:1234/v1',
    model: 'local-model',
  },
});

console.log(result.graph);
// {
//   nodes: [
//     { id: 'node_1', label: 'Steve Jobs', type: 'person' },
//     { id: 'node_2', label: 'Apple', type: 'organization' },
//     { id: 'node_3', label: '1976', type: 'date' }
//   ],
//   edges: [
//     { id: 'edge_1', source: 'node_1', target: 'node_2', type: 'founded', label: 'founded' },
//     { id: 'edge_2', source: 'node_2', target: 'node_3', type: 'founded_in', label: 'founded in' }
//   ]
// }
```

### With Custom Schema

```typescript
import { extract } from '@graph-extract/core';

const result = await extract(text, {
  provider: {
    type: 'lmstudio',
    baseUrl: 'http://localhost:1234/v1',
    model: 'local-model',
  },
  schema: {
    entityTypes: ['person', 'company', 'technology'],
    relationTypes: ['works_for', 'founded', 'uses', 'created'],
    instructions: 'Focus on employment and creation relationships.',
  },
});
```

### Reusable Extractor Instance

```typescript
import { createExtractor } from '@graph-extract/core';

const extractor = createExtractor({
  provider: {
    type: 'lmstudio',
    baseUrl: 'http://localhost:1234/v1',
    model: 'local-model',
  },
  mode: 'single',
  temperature: 0,
  maxRetries: 2,
});

// Reuse for multiple extractions
const result1 = await extractor.extract(text1);
const result2 = await extractor.extract(text2, { mode: 'staged' });

// Override schema per-extraction
const result3 = await extractor.extract(text3, {
  schema: { entityTypes: ['person', 'location'] },
});
```

### Staged Mode

Use `mode: 'staged'` for smaller local models that struggle with the one-shot graph prompt. Staged mode performs an entity pass and a relationship pass, then compiles the final graph deterministically in code.

### Validation Only

```typescript
import { validate } from '@graph-extract/core';

const result = validate(existingGraph);

if (!result.valid) {
  console.log('Errors:', result.errors);
}

if (result.warnings.length > 0) {
  console.log('Warnings:', result.warnings);
}

// Use cleaned graph (invalid edges removed)
const cleanGraph = result.graph;
```

---

## Prompt Template

```typescript
// packages/graph-extract/src/prompt.ts

export function buildPrompt(text: string, schema: Schema): string {
  const entityTypes = schema.entityTypes ?? DEFAULT_ENTITY_TYPES;
  const relationTypes = schema.relationTypes ?? DEFAULT_RELATION_TYPES;

  return `Extract all entities and relationships from the following text as a JSON knowledge graph.

TEXT:
${text}

ENTITY TYPES: ${entityTypes.join(', ')}

RELATIONSHIP TYPES: ${relationTypes.join(', ')}
${schema.instructions ? `\nADDITIONAL INSTRUCTIONS:\n${schema.instructions}` : ''}

OUTPUT FORMAT:
Return ONLY valid JSON with this exact structure:
{
  "nodes": [
    {"id": "node_1", "label": "Entity Name", "type": "entity_type"}
  ],
  "edges": [
    {"id": "edge_1", "source": "node_1", "target": "node_2", "type": "relation_type", "label": "human readable"}
  ]
}

RULES:
1. Output ONLY valid JSON - no markdown code blocks, no explanation, no preamble
2. Every edge source and target must reference an existing node ID
3. Deduplicate entities - same real-world entity = one node
4. Use sequential IDs: node_1, node_2, ..., edge_1, edge_2, ...
5. Extract ALL entities and relationships present in the text
6. Use lowercase_with_underscores for relation types
7. Labels should be human-readable

JSON:`;
}
```

### Staged Prompt Builders

Staged mode uses separate prompt builders and response schemas for:
- entity extraction: `{ entities: [{ text, type, mention? }] }`
- relationship extraction: `{ relationships: [{ source, target, type, mention? }] }`

When `responseFormat=json_schema` is enabled, staged mode applies stage-specific JSON schemas rather than the final graph schema.

---

## Validation Logic

```typescript
// packages/graph-extract/src/validate.ts

export function validate(graph: Graph): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  const nodeIds = new Set<string>();
  const edgeIds = new Set<string>();

  // Check nodes
  for (const node of graph.nodes) {
    if (!node.id) {
      errors.push({
        type: 'missing_node_id',
        message: `Node missing id: ${JSON.stringify(node)}`,
      });
      continue;
    }
    if (nodeIds.has(node.id)) {
      errors.push({
        type: 'duplicate_id',
        message: `Duplicate node id: ${node.id}`,
      });
    }
    nodeIds.add(node.id);
  }

  // Check edges and filter invalid ones
  const validEdges: Edge[] = [];
  
  for (const edge of graph.edges) {
    if (!edge.id) {
      errors.push({
        type: 'missing_edge_id',
        message: `Edge missing id: ${JSON.stringify(edge)}`,
      });
      continue;
    }
    
    if (edgeIds.has(edge.id)) {
      errors.push({
        type: 'duplicate_id',
        message: `Duplicate edge id: ${edge.id}`,
      });
    }
    edgeIds.add(edge.id);

    let isValid = true;

    if (!nodeIds.has(edge.source)) {
      warnings.push({
        type: 'invalid_edge_source',
        message: `Edge ${edge.id} references non-existent source: ${edge.source}`,
        edgeId: edge.id,
        details: { source: edge.source },
      });
      isValid = false;
    }

    if (!nodeIds.has(edge.target)) {
      warnings.push({
        type: 'invalid_edge_target',
        message: `Edge ${edge.id} references non-existent target: ${edge.target}`,
        edgeId: edge.id,
        details: { target: edge.target },
      });
      isValid = false;
    }

    if (isValid) {
      validEdges.push(edge);
    } else {
      warnings.push({
        type: 'removed_edge',
        message: `Removed invalid edge: ${edge.id}`,
        edgeId: edge.id,
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    graph: {
      nodes: graph.nodes.filter(n => n.id), // Remove nodes without IDs
      edges: validEdges,
    },
  };
}
```

---

## CLI Interface

```bash
# Basic usage - reads from stdin, writes to stdout
echo "Steve Jobs founded Apple in 1976" | graph-extract

# From file
graph-extract -i document.txt

# Output to file
graph-extract -i document.txt -o graph.json

# Pretty print JSON
graph-extract -i document.txt --pretty

# Custom schema file
graph-extract -i document.txt -s schema.json

# Specify provider options
graph-extract -i document.txt \
  --provider lmstudio \
  --base-url http://localhost:1234/v1 \
  --model my-model \
  --api-key local-token \
  --response-format json_schema

# Stop chat-template delimiters
graph-extract -i document.txt --model my-model --stop '<|im_end|>'

# Limit graph size for weaker local models
graph-extract -i document.txt --model my-model --max-nodes 25 --max-edges 40

# Use staged mode for smaller local models
graph-extract -i document.txt --model my-model --mode staged

# Validate existing graph file
graph-extract validate graph.json

# Show help
graph-extract --help
```

### CLI Arguments

| Argument | Short | Description |
|----------|-------|-------------|
| `--input` | `-i` | Input file path (default: stdin) |
| `--output` | `-o` | Output file path (default: stdout) |
| `--schema` | `-s` | Schema JSON file path |
| `--pretty` | `-p` | Pretty print JSON output |
| `--provider` | | Provider type (default: lmstudio) |
| `--base-url` | | Provider base URL |
| `--model` | `-m` | Model identifier |
| `--api-key` | | Provider API key |
| `--stop` | | Stop sequence; repeat to pass multiple |
| `--response-format` | | OpenAI-compatible response format |
| `--mode` | | Extraction mode (`single` or `staged`) |
| `--max-nodes` | | Maximum number of nodes to return |
| `--max-edges` | | Maximum number of edges to return |
| `--help` | `-h` | Show help |
| `--version` | `-v` | Show version |

### Schema File Format

```json
{
  "entityTypes": ["person", "company", "product", "technology"],
  "relationTypes": ["works_for", "founded", "created", "uses", "owns"],
  "instructions": "Focus on business relationships and product ownership.",
  "maxNodes": 25,
  "maxEdges": 40
}
```

---

## Environment Variables

```bash
# Provider defaults
GRAPH_EXTRACT_PROVIDER=lmstudio
GRAPH_EXTRACT_BASE_URL=http://localhost:1234/v1
GRAPH_EXTRACT_MODEL=local-model
GRAPH_EXTRACT_API_KEY=local-token
GRAPH_EXTRACT_STOP=<|im_end|>
GRAPH_EXTRACT_RESPONSE_FORMAT=json_schema
GRAPH_EXTRACT_MODE=single

# API keys (for cloud providers)
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
```

---

## Package Configuration

### Root package.json

```json
{
  "name": "graph-extract-monorepo",
  "private": true,
  "workspaces": ["packages/*", "apps/*"],
  "scripts": {
    "build": "bun run --filter '*' build",
    "test": "bun run --filter '*' test",
    "lint": "biome check .",
    "format": "biome format --write .",
    "typecheck": "bun run --filter '*' typecheck"
  },
  "devDependencies": {
    "@biomejs/biome": "^1.9.0",
    "@types/bun": "latest",
    "typescript": "^5.7.0"
  }
}
```

### packages/graph-extract/package.json

```json
{
  "name": "@graph-extract/core",
  "version": "0.1.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsc",
    "test": "bun test",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "openai": "^4.70.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0"
  }
}
```

### apps/cli/package.json

```json
{
  "name": "@graph-extract/cli",
  "version": "0.1.0",
  "type": "module",
  "bin": {
    "graph-extract": "./dist/index.js"
  },
  "scripts": {
    "build": "bun build ./src/index.ts --outdir ./dist --target node --minify",
    "dev": "bun run ./src/index.ts",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@graph-extract/core": "workspace:*"
  }
}
```

### tsconfig.base.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true
  }
}
```

### biome.json

```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.0/schema.json",
  "organizeImports": { "enabled": true },
  "linter": {
    "enabled": true,
    "rules": { "recommended": true }
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "single",
      "semicolons": "always",
      "trailingCommas": "all"
    }
  }
}
```

---

## Error Handling

```typescript
// packages/graph-extract/src/errors.ts

export class GraphExtractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GraphExtractError';
  }
}

export class ParseError extends GraphExtractError {
  constructor(
    message: string,
    public readonly rawResponse: string,
  ) {
    super(message);
    this.name = 'ParseError';
  }
}

export class ProviderError extends GraphExtractError {
  constructor(
    message: string,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}
```

---

## Future TODO

Items to consider for future development (not in initial scope):

- [ ] **Batching/Chunking** - Split long documents, extract from chunks, merge graphs with deduplication
- [ ] **Graph Merging** - Utilities to merge multiple graphs with entity resolution
- [ ] **Web UI** - XYFlow-based visualization (`apps/web/`)
- [ ] **Streaming** - Stream partial results as extraction progresses
- [ ] **Caching** - Cache extraction results by content hash
- [ ] **Neo4j Adapter** - Export graphs directly to Neo4j
- [ ] **Confidence Scores** - Add confidence metadata to nodes/edges
- [ ] **Provenance Tracking** - Track which text spans produced which entities
- [ ] **Custom Prompts** - Allow full prompt override for specialized use cases
- [ ] **Multiple Extraction Passes** - Run multiple models and merge/vote on results

---

## Testing Strategy

### Unit Tests

- `parse.test.ts` - JSON parsing edge cases, malformed responses
- `validate.test.ts` - Validation logic, edge removal
- `prompt.test.ts` - Prompt generation with various schemas

### Integration Tests

- `extract.test.ts` - Full extraction with mock LLM responses
- Fixtures with known input/output pairs

### Manual Testing

CLI against LM Studio with real text samples.

---

## Implementation Order

1. **Types** - Define all interfaces in `types.ts`
2. **Schema** - Default entity/relation types in `schema.ts`
3. **Validation** - Build validation logic in `validate.ts` (no LLM needed)
4. **Prompt** - Build prompt generation in `prompt.ts`
5. **Parse** - JSON parsing with error handling in `parse.ts`
6. **Extractor** - Wire up to OpenAI-compatible API in `extractor.ts`
7. **Extract** - Simple `extract()` function in `extract.ts`
8. **Index** - Public exports in `index.ts`
9. **CLI** - Build CLI wrapper in `apps/cli/`
10. **Tests** - Add unit and integration tests
