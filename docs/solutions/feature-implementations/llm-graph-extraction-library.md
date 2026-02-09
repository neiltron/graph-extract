---
title: "Implement LLM-based graph extraction library with CLI"
date: 2026-01-29
category: feature-implementation
tags:
  - llm-integration
  - graph-extraction
  - typescript
  - bun
  - monorepo
  - cli-tool
  - json-parsing
  - provider-agnostic
module: graph-extract
symptoms:
  - "Need automated entity extraction from unstructured text"
  - "Require relationship identification between extracted entities"
  - "Need consistent JSON graph output format (nodes and edges)"
  - "Require support for multiple LLM providers"
  - "Need robust handling of malformed LLM JSON responses"
severity: high
---

# LLM-Based Graph Extraction Library

## Problem

Building a library that extracts entities and relationships from text using LLMs, outputting structured JSON graph data (nodes + edges). Key challenges:

1. **Provider agnosticism** - Support multiple LLM providers (OpenAI, Anthropic, LM Studio, Ollama)
2. **Robust JSON parsing** - LLMs frequently return malformed JSON with markdown fences, trailing commas, numeric IDs
3. **Graph validation** - Ensure edge references point to valid nodes
4. **Retry logic** - Handle parse failures gracefully

## Solution

### Architecture: Monorepo with Bun Workspaces

```
graph-extract/
├── packages/graph-extract/    # Core library (@graph-extract/core)
│   └── src/
│       ├── extractor.ts       # LLM integration with retries
│       ├── parse.ts           # Robust JSON parsing
│       ├── validate.ts        # Graph validation
│       ├── prompt.ts          # Prompt engineering
│       └── types.ts           # TypeScript types
├── apps/cli/                  # CLI application
└── package.json               # Workspace root
```

### Key Pattern 1: Provider-Agnostic LLM Calls

Use OpenAI SDK as universal wrapper since most providers support OpenAI-compatible APIs:

```typescript
function createOpenAIClient(provider: ProviderConfig): OpenAI {
  const baseURL = getBaseURL(provider);
  const apiKey = getApiKey(provider);
  return new OpenAI({ baseURL, apiKey, timeout: 60000 });
}

function getBaseURL(provider: ProviderConfig): string | undefined {
  switch (provider.type) {
    case 'lmstudio': return 'http://localhost:1234/v1';
    case 'ollama': return 'http://localhost:11434/v1';
    case 'openai': return undefined; // Use default
    default: return provider.baseUrl;
  }
}

function getApiKey(provider: ProviderConfig): string {
  if (provider.apiKey) return provider.apiKey;
  switch (provider.type) {
    case 'lmstudio':
    case 'ollama': return 'not-needed';
    case 'openai': return process.env.OPENAI_API_KEY ?? '';
    default: return '';
  }
}
```

### Key Pattern 2: Robust JSON Parsing

Handle common LLM output issues:

```typescript
export function parseGraph(raw: string): Graph {
  let cleaned = raw.trim();

  // 1. Strip markdown code fences
  const fenceMatch = cleaned.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/);
  if (fenceMatch?.[1]) {
    cleaned = fenceMatch[1].trim();
  }

  // 2. Extract JSON from preamble text
  if (!cleaned.startsWith('{')) {
    const jsonStart = cleaned.indexOf('{');
    if (jsonStart !== -1) {
      let depth = 0, jsonEnd = -1;
      for (let i = jsonStart; i < cleaned.length; i++) {
        if (cleaned[i] === '{') depth++;
        if (cleaned[i] === '}') depth--;
        if (depth === 0) { jsonEnd = i; break; }
      }
      if (jsonEnd !== -1) cleaned = cleaned.substring(jsonStart, jsonEnd + 1);
    }
  }

  // 3. Remove trailing commas
  cleaned = cleaned.replace(/,(\s*[}\]])/g, '$1');

  // 4. Parse and normalize
  const parsed = JSON.parse(cleaned);
  const nodes = (parsed.nodes ?? []).map(normalizeNode).filter(Boolean);
  const edges = (parsed.edges ?? []).map(normalizeEdge).filter(Boolean);
  return { nodes, edges };
}

function normalizeNode(raw: unknown): Node | null {
  const obj = raw as Record<string, unknown>;
  const id = obj.id != null ? String(obj.id) : undefined; // Coerce numeric IDs
  if (!id) return null;
  return {
    id,
    label: typeof obj.label === 'string' ? obj.label : String(obj.label ?? ''),
    type: typeof obj.type === 'string' ? obj.type : 'other',
  };
}
```

### Key Pattern 3: Retry Logic

Retry on parse failures, fail fast on other errors:

```typescript
async extract(text: string, options?: ExtractionOptions): Promise<ExtractionResult> {
  if (!text?.trim()) throw new GraphExtractError('Input text cannot be empty');

  let lastError: ParseError | undefined;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await this.callLLM(prompt, temperature, maxTokens);
      const graph = parseGraph(response.content);
      const validated = validate(graph);
      return { graph: validated.graph, warnings: validated.warnings, raw: response.content };
    } catch (e) {
      if (e instanceof ParseError) { lastError = e; continue; }
      throw e;
    }
  }
  throw lastError ?? new ParseError('Failed to parse LLM response', '');
}
```

### Key Pattern 4: Graph Validation

Validate structure and remove invalid edges:

```typescript
export function validate(graph: Graph): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  const nodeIds = new Set<string>();

  // Check nodes
  for (const node of graph.nodes) {
    if (!node.id) { errors.push({ type: 'missing_node_id', message: '...' }); continue; }
    if (nodeIds.has(node.id)) { errors.push({ type: 'duplicate_id', message: '...' }); }
    nodeIds.add(node.id);
  }

  // Check edges - remove invalid ones
  const validEdges: Edge[] = [];
  for (const edge of graph.edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      warnings.push({ type: 'removed_edge', message: `Removed invalid edge: ${edge.id}` });
      continue;
    }
    validEdges.push(edge);
  }

  return { valid: errors.length === 0, errors, warnings, graph: { nodes: graph.nodes, edges: validEdges } };
}
```

### Key Pattern 5: CLI with Layered Configuration

CLI args > Environment variables > Defaults:

```typescript
function resolveProvider(args: ExtractArgs) {
  return {
    type: args.provider ?? process.env.GRAPH_EXTRACT_PROVIDER ?? 'lmstudio',
    baseUrl: args.baseUrl ?? process.env.GRAPH_EXTRACT_BASE_URL,
    model: args.model ?? process.env.GRAPH_EXTRACT_MODEL ?? '',
  };
}
```

## Prevention Strategies

### LLM Response Handling

| Do | Don't |
|----|-------|
| Strip markdown fences before parsing | Trust LLM output without preprocessing |
| Remove trailing commas | Use `JSON.parse()` directly |
| Coerce numeric IDs to strings | Assume correct types |
| Implement retry logic | Retry indefinitely |
| Log raw responses for debugging | Expose raw responses in production |

### Monorepo Setup

| Do | Don't |
|----|-------|
| Use `workspace:*` for internal deps | Hardcode version numbers |
| Share TypeScript base config | Duplicate compiler options |
| Generate declaration files | Skip type exports |
| Keep library separate from CLI | Mix concerns |

### CLI Design

| Do | Don't |
|----|-------|
| Support stdin/stdout for piping | Force file I/O only |
| Use stderr for errors | Mix output and errors |
| Implement meaningful exit codes | Use opaque codes |
| Document environment variables | Hide configuration options |

## Testing

39 tests covering:
- JSON parsing edge cases (markdown fences, trailing commas, preamble text)
- Validation logic (missing IDs, duplicate IDs, invalid edge references)
- Error handling (empty input, parse failures)

```bash
bun test  # Run all tests
```

## Related Documentation

- `docs/spec.md` - Full specification
- `docs/plans/2026-01-29-feat-implement-graph-extract-library-and-cli-plan.md` - Implementation plan

## Usage

### Library

```typescript
import { extract, createExtractor } from '@graph-extract/core';

const result = await extract('Steve Jobs founded Apple in 1976.', {
  provider: { type: 'lmstudio', model: 'local-model' },
});
console.log(result.graph); // { nodes: [...], edges: [...] }
```

### CLI

```bash
echo "Alice works at Acme" | bun run apps/cli/src/index.ts -m my-model
bun run apps/cli/src/index.ts -i doc.txt -o graph.json -m my-model --pretty
bun run apps/cli/src/index.ts validate graph.json
```
