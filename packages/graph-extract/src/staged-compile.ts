import type { ExtractedEntity, ExtractedRelationship } from './staged-types.js';
import type { Edge, Graph, Node, ValidationWarning } from './types.js';

export interface CompileGraphInput {
  entities: ExtractedEntity[];
  relationships: ExtractedRelationship[];
}

export interface CompiledGraphResult {
  graph: Graph;
  warnings: ValidationWarning[];
}

export function compileGraphFromStages(input: CompileGraphInput): CompiledGraphResult {
  const warnings: ValidationWarning[] = [];
  const nodes: Node[] = [];
  const nodeIdByKey = new Map<string, string>();
  const relationshipKeys = new Set<string>();
  const edges: Edge[] = [];

  for (const entity of input.entities) {
    const key = normalizeEntityKey(entity.text);
    if (!key || nodeIdByKey.has(key)) {
      continue;
    }

    const label = entity.text.trim();
    const type = normalizeEntityType(entity.type);
    const nodeId = `node_${nodes.length + 1}`;

    nodeIdByKey.set(key, nodeId);
    nodes.push({
      id: nodeId,
      label,
      type,
    });
  }

  for (const relationship of input.relationships) {
    const sourceKey = normalizeEntityKey(relationship.source);
    const targetKey = normalizeEntityKey(relationship.target);
    const type = normalizeRelationType(relationship.type);

    const sourceId = sourceKey ? nodeIdByKey.get(sourceKey) : undefined;
    if (!sourceId) {
      warnings.push({
        type: 'unresolved_relationship_source',
        message: `Relationship source could not be resolved: ${relationship.source}`,
        details: {
          source: relationship.source,
          target: relationship.target,
          type,
        },
      });
      continue;
    }

    const targetId = targetKey ? nodeIdByKey.get(targetKey) : undefined;
    if (!targetId) {
      warnings.push({
        type: 'unresolved_relationship_target',
        message: `Relationship target could not be resolved: ${relationship.target}`,
        details: {
          source: relationship.source,
          target: relationship.target,
          type,
        },
      });
      continue;
    }

    const relationshipKey = `${sourceId}:${targetId}:${type}`;
    if (relationshipKeys.has(relationshipKey)) {
      continue;
    }

    relationshipKeys.add(relationshipKey);
    edges.push({
      id: `edge_${edges.length + 1}`,
      source: sourceId,
      target: targetId,
      type,
      label: type.replace(/_/g, ' '),
    });
  }

  return {
    graph: { nodes, edges },
    warnings,
  };
}

function normalizeEntityKey(value: string): string | undefined {
  const normalized = value.trim().toLowerCase();
  return normalized || undefined;
}

function normalizeEntityType(value: string): string {
  const normalized = value.trim();
  return normalized || 'other';
}

function normalizeRelationType(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, '_');
  return normalized || 'related_to';
}
