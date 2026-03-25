import { ParseError } from './errors.js';
import type { Edge, Graph, Node } from './types.js';

/**
 * Parse a JSON graph from an LLM response.
 * Handles common issues like:
 * - Markdown code fences
 * - Trailing commas
 * - Numeric IDs (coerced to strings)
 * - Missing nodes/edges arrays (default to empty)
 */
export function parseGraph(raw: string): Graph {
  // Strip markdown code fences if present
  let cleaned = raw.trim();

  // Handle ```json ... ``` or ``` ... ```
  const fenceMatch = cleaned.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/);
  if (fenceMatch?.[1]) {
    cleaned = fenceMatch[1].trim();
  }

  // Extract the first balanced JSON object/array if there's preamble or trailing junk.
  const extracted = extractBalancedJson(cleaned);
  if (extracted) {
    cleaned = extracted;
  }

  // Remove trailing commas (common LLM mistake)
  cleaned = cleaned.replace(/,(\s*[}\]])/g, '$1');

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    throw new ParseError(`Failed to parse JSON: ${(e as Error).message}`, raw);
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new ParseError('Response is not a JSON object', raw);
  }

  const obj = parsed as Record<string, unknown>;

  // Extract and normalize nodes
  const rawNodes = Array.isArray(obj.nodes) ? obj.nodes : [];
  const nodes: Node[] = rawNodes.map(normalizeNode).filter((n): n is Node => n !== null);

  // Extract and normalize edges
  const rawEdges = Array.isArray(obj.edges) ? obj.edges : [];
  const edges: Edge[] = rawEdges.map(normalizeEdge).filter((e): e is Edge => e !== null);

  return { nodes, edges };
}

function extractBalancedJson(text: string): string | undefined {
  const objectStart = text.indexOf('{');
  const arrayStart = text.indexOf('[');

  let start = -1;
  if (objectStart === -1) {
    start = arrayStart;
  } else if (arrayStart === -1) {
    start = objectStart;
  } else {
    start = Math.min(objectStart, arrayStart);
  }

  if (start === -1) {
    return undefined;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const char = text[i];
    if (!char) {
      continue;
    }

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === '{' || char === '[') {
      depth++;
      continue;
    }

    if (char === '}' || char === ']') {
      depth--;
      if (depth === 0) {
        return text.substring(start, i + 1);
      }
    }
  }

  return undefined;
}

/**
 * Normalize a node from LLM response.
 * Coerces numeric IDs to strings.
 */
function normalizeNode(raw: unknown): Node | null {
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }

  const obj = raw as Record<string, unknown>;

  // Coerce ID to string
  const id = obj.id != null ? String(obj.id) : undefined;
  if (!id) {
    return null;
  }

  const label = typeof obj.label === 'string' ? obj.label : String(obj.label ?? '');
  const type = typeof obj.type === 'string' ? obj.type : 'other';

  const node: Node = { id, label, type };

  // Preserve metadata if present
  if (typeof obj.metadata === 'object' && obj.metadata !== null) {
    node.metadata = obj.metadata as Record<string, unknown>;
  }

  return node;
}

/**
 * Normalize an edge from LLM response.
 * Coerces numeric IDs to strings.
 */
function normalizeEdge(raw: unknown): Edge | null {
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }

  const obj = raw as Record<string, unknown>;

  // Coerce IDs to strings
  const id = obj.id != null ? String(obj.id) : undefined;
  const source = obj.source != null ? String(obj.source) : undefined;
  const target = obj.target != null ? String(obj.target) : undefined;

  if (!id || !source || !target) {
    return null;
  }

  const type = typeof obj.type === 'string' ? obj.type : 'related_to';
  const label = typeof obj.label === 'string' ? obj.label : type.replace(/_/g, ' ');

  const edge: Edge = { id, source, target, type, label };

  // Preserve metadata if present
  if (typeof obj.metadata === 'object' && obj.metadata !== null) {
    edge.metadata = obj.metadata as Record<string, unknown>;
  }

  return edge;
}
