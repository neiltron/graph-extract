import { DEFAULT_ENTITY_TYPES, DEFAULT_RELATION_TYPES, type Schema } from './types.js';

/**
 * Build the extraction prompt for the LLM.
 */
export function buildPrompt(text: string, schema: Schema): string {
  const entityTypes = schema.entityTypes ?? DEFAULT_ENTITY_TYPES;
  const relationTypes = schema.relationTypes ?? DEFAULT_RELATION_TYPES;
  const outputLimits = buildOutputLimits(schema);

  return `Extract all entities and relationships from the following text as a JSON knowledge graph.

TEXT:
${text}

ENTITY TYPES: ${entityTypes.join(', ')}

RELATIONSHIP TYPES: ${relationTypes.join(', ')}
${schema.instructions ? `\nADDITIONAL INSTRUCTIONS:\n${schema.instructions}` : ''}
${outputLimits ? `\nOUTPUT LIMITS:\n${outputLimits}` : ''}

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
8. Edge direction matters: source is the subject and target is the object, so "<source label> <relation type> <target label>" must read as a true sentence; swap source and target if it only reads correctly reversed
${schema.maxNodes ? `9. Return at most ${schema.maxNodes} nodes` : ''}
${schema.maxEdges ? `\n${schema.maxNodes ? 10 : 9}. Return at most ${schema.maxEdges} edges` : ''}
${schema.maxNodes || schema.maxEdges ? `\n${schema.maxNodes && schema.maxEdges ? 11 : 10}. If limits are reached, keep only the most salient entities and relationships` : ''}

JSON:`;
}

function buildOutputLimits(schema: Schema): string {
  const lines: string[] = [];

  if (schema.maxNodes) {
    lines.push(`- max nodes: ${schema.maxNodes}`);
  }

  if (schema.maxEdges) {
    lines.push(`- max edges: ${schema.maxEdges}`);
  }

  return lines.join('\n');
}
