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

  // Try to find JSON object if there's preamble text
  if (!cleaned.startsWith('{')) {
    const jsonStart = cleaned.indexOf('{');
    if (jsonStart !== -1) {
      // Find matching closing brace
      let depth = 0;
      let jsonEnd = -1;
      for (let i = jsonStart; i < cleaned.length; i++) {
        if (cleaned[i] === '{') depth++;
        if (cleaned[i] === '}') depth--;
        if (depth === 0) {
          jsonEnd = i;
          break;
        }
      }
      if (jsonEnd !== -1) {
        cleaned = cleaned.substring(jsonStart, jsonEnd + 1);
      }
    }
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
