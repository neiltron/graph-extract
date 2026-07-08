# graph-extract

LLM-based entity and relationship extraction library that outputs JSON graph structures (nodes + edges).

## Installation

```bash
bun install
```

## Quick Start

### Library Usage

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
//     { id: 'edge_1', source: 'node_1', target: 'node_2', type: 'founded', label: 'founded' }
//   ]
// }
```

### Staged Mode for Smaller Models

```typescript
const result = await extract('Alice works at Acme Corp.', {
  provider: {
    type: 'lmstudio',
    baseUrl: 'http://localhost:1234/v1',
    model: 'small-local-model',
    responseFormat: 'json_schema',
  },
  mode: 'staged',
});
```

Use `mode: 'staged'` when smaller local models struggle with the one-shot graph schema. Staged mode breaks extraction into simpler passes, then assembles the final graph deterministically in code:

1. **Entity pass** extracts candidate entities with grounding mentions. Entities get stable intermediate IDs (`E1`, `E2`, ...) and deterministic code builds an entity catalog plus evidence snippets from the source text.
2. **Relation schema pass** (only when you don't provide `relationTypes`) proposes relation types from the catalog and snippets.
3. **Relationship pass** extracts relationships over the entity catalog, referencing entities by ID.

Compilation then handles deduplication, alias-based entity resolution, referential integrity, and final node/edge ID assignment.

### Progress Events

Pass `onProgress` (in the extractor config or per-call options) to observe stage transitions, which is useful for CLI spinners or logging with slow local models:

```typescript
const result = await extract(text, {
  provider,
  mode: 'staged',
  onProgress: (event) => console.error(event.type, 'stage' in event ? event.stage : ''),
});
```

Events: `stage_start` / `stage_complete` (stages: `single`, `entity`, `relation_schema`, `relationship`), `compile_start`, and `complete` with node, edge, and warning counts.

### CLI Usage

```bash
# Extract from stdin
echo "Alice works at Acme Corp" | bun run apps/cli/src/index.ts -m my-model

# Extract from file
bun run apps/cli/src/index.ts -i document.txt -o graph.json -m my-model

# Limit output size for small local models
bun run apps/cli/src/index.ts -i document.txt -m my-model --max-nodes 25 --max-edges 40

# Use staged mode for smaller local models
bun run apps/cli/src/index.ts -i document.txt -m my-model --mode staged

# Stop chat-template delimiters from leaking into output
bun run apps/cli/src/index.ts -i document.txt -m my-model --stop '<|im_end|>'

# Validate existing graph
bun run apps/cli/src/index.ts validate graph.json --pretty

# Export an existing graph to Obsidian canvas
bun run apps/cli/src/index.ts canvas graph.json -o graph.canvas --pretty
```

## Configuration

### Environment Variables

```bash
GRAPH_EXTRACT_PROVIDER=lmstudio
GRAPH_EXTRACT_BASE_URL=http://localhost:1234/v1
GRAPH_EXTRACT_MODEL=local-model
GRAPH_EXTRACT_API_KEY=local-token
GRAPH_EXTRACT_STOP=<|im_end|>
GRAPH_EXTRACT_RESPONSE_FORMAT=json_schema
GRAPH_EXTRACT_MODE=single

# For cloud providers
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
```

Use `GRAPH_EXTRACT_API_KEY` or `--api-key` for OpenAI-compatible servers that require a token even on `localhost`.
Use `GRAPH_EXTRACT_STOP` or repeated `--stop` flags to stop local chat-template delimiters like `<|im_end|>`.
Structured outputs (`json_schema`) are the default for the `lmstudio` provider: stage-specific schemas constrain entity types, relation types, entity/snippet IDs, and array sizes at decode time, which small local models need for reliable output. If the server rejects `response_format`, the extractor falls back to plain output with a warning. Use `--response-format text` (or `GRAPH_EXTRACT_RESPONSE_FORMAT=text`) to disable, or `json_object`/`json_schema` to set it explicitly for other OpenAI-compatible providers.
Use `--request-timeout` or `GRAPH_EXTRACT_REQUEST_TIMEOUT` (seconds, default 240) to bound each model call; the client no longer retries silently.
Use `--relationship-scope snippet` (or `GRAPH_EXTRACT_RELATIONSHIP_SCOPE`) in staged mode to run one small relationship call per evidence snippet instead of one global call: per-call output stays bounded and subject/object decisions are made one sentence at a time, at the cost of more (cheap) calls. A snippet whose extraction fails is skipped with a warning instead of failing the run.
Use `--prune-isolated` (or `GRAPH_EXTRACT_PRUNE_ISOLATED=1`, or `pruneIsolatedNodes` in a schema file) to drop nodes that end up with no edges; without it the extractor keeps them and attaches an `isolated_nodes` warning.
Use `GRAPH_EXTRACT_MODE` or `--mode` to choose between `single` and `staged` extraction.
Use `--max-nodes` and `--max-edges` to cap output size for smaller or less reliable local models.
Use `GRAPH_EXTRACT_MAX_TOKENS` or `--max-tokens` to raise the per-call completion budget (default 16384); small models that loop or emit verbose JSON need headroom here, especially in staged mode's relationship pass.

## Development

```bash
# Install dependencies
bun install

# Run tests
bun test

# Type check
bun run typecheck

# Lint
bun run lint

# Build
bun run build
```

## License

MIT
