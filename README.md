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

### CLI Usage

```bash
# Extract from stdin
echo "Alice works at Acme Corp" | bun run apps/cli/src/index.ts -m my-model

# Extract from file
bun run apps/cli/src/index.ts -i document.txt -o graph.json -m my-model

# Validate existing graph
bun run apps/cli/src/index.ts validate graph.json --pretty
```

## Configuration

### Environment Variables

```bash
GRAPH_EXTRACT_PROVIDER=lmstudio
GRAPH_EXTRACT_BASE_URL=http://localhost:1234/v1
GRAPH_EXTRACT_MODEL=local-model
GRAPH_EXTRACT_API_KEY=local-token

# For cloud providers
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
```

Use `GRAPH_EXTRACT_API_KEY` or `--api-key` for OpenAI-compatible servers that require a token even on `localhost`.

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
