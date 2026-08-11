import { buildEntityCatalog } from './staged-context.js';
import type { CatalogEntity, ExtractedEntity, ExtractedRelationship } from './staged-types.js';
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
  const intermediateNodeIdByKey = new Map<string, string>();
  const exactNodeIdByKey = new Map<string, string>();
  const aliasNodeIdByKey = new Map<string, string>();
  const ambiguousAliasKeys = new Set<string>();
  const relationshipKeys = new Set<string>();
  const edges: Edge[] = [];
  const catalog = buildEntityCatalog(input.entities);

  for (const entity of catalog) {
    const key = normalizeEntityKey(entity.text);
    if (!key) {
      continue;
    }

    const label = entity.text.trim();
    const type = normalizeEntityType(entity.type);
    const nodeId = `node_${nodes.length + 1}`;

    intermediateNodeIdByKey.set(entity.id, nodeId);
    exactNodeIdByKey.set(key, nodeId);
    nodes.push({
      id: nodeId,
      label,
      type,
    });

    for (const aliasKey of buildEntityAliasKeys(entity, type)) {
      registerAlias(aliasNodeIdByKey, ambiguousAliasKeys, exactNodeIdByKey, aliasKey, nodeId);
    }
  }

  for (const relationship of input.relationships) {
    const sourceId = resolveRelationshipEndpoint(
      relationship,
      'source',
      intermediateNodeIdByKey,
      exactNodeIdByKey,
      aliasNodeIdByKey,
    );
    const targetId = resolveRelationshipEndpoint(
      relationship,
      'target',
      intermediateNodeIdByKey,
      exactNodeIdByKey,
      aliasNodeIdByKey,
    );
    const type = normalizeRelationType(relationship.type);

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
  const normalized = normalizeWhitespace(stripWrappingQuotes(value)).toLowerCase();
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

function buildEntityAliasKeys(entity: CatalogEntity, type: string): string[] {
  const label = entity.text.trim();
  const mention = entity.mention?.trim();
  const aliases = new Set<string>();

  aliases.add(`${label} (${type})`);

  if (mention && normalizeEntityKey(mention) !== normalizeEntityKey(label)) {
    aliases.add(mention);
    aliases.add(`${label} (${mention})`);
    aliases.add(`${mention} (${label})`);
  }

  return [...aliases];
}

function registerAlias(
  aliasNodeIdByKey: Map<string, string>,
  ambiguousAliasKeys: Set<string>,
  exactNodeIdByKey: Map<string, string>,
  alias: string,
  nodeId: string,
) {
  const key = normalizeEntityKey(alias);
  if (!key || exactNodeIdByKey.has(key) || ambiguousAliasKeys.has(key)) {
    return;
  }

  const existing = aliasNodeIdByKey.get(key);
  if (!existing) {
    aliasNodeIdByKey.set(key, nodeId);
    return;
  }

  if (existing !== nodeId) {
    aliasNodeIdByKey.delete(key);
    ambiguousAliasKeys.add(key);
  }
}

function resolveRelationshipEndpoint(
  relationship: ExtractedRelationship,
  role: 'source' | 'target',
  intermediateNodeIdByKey: Map<string, string>,
  exactNodeIdByKey: Map<string, string>,
  aliasNodeIdByKey: Map<string, string>,
): string | undefined {
  const endpointId = role === 'source' ? relationship.sourceId : relationship.targetId;
  if (endpointId) {
    const directMatch = intermediateNodeIdByKey.get(endpointId.trim());
    if (directMatch) {
      return directMatch;
    }
  }

  const endpointText = role === 'source' ? relationship.source : relationship.target;
  if (!endpointText) {
    return undefined;
  }

  const directKey = normalizeEntityKey(endpointText);
  if (!directKey) {
    return undefined;
  }

  const directMatch = exactNodeIdByKey.get(directKey) ?? aliasNodeIdByKey.get(directKey);
  if (directMatch) {
    return directMatch;
  }

  const strippedKey = normalizeEntityKey(stripTrailingParenthetical(endpointText));
  if (!strippedKey || strippedKey === directKey) {
    return undefined;
  }

  return exactNodeIdByKey.get(strippedKey) ?? aliasNodeIdByKey.get(strippedKey);
}

function stripTrailingParenthetical(value: string): string {
  return normalizeWhitespace(stripWrappingQuotes(value).replace(/\s*\([^()]+\)\s*$/, ''));
}

function stripWrappingQuotes(value: string): string {
  return value.trim().replace(/^["'`“”]+|["'`“”]+$/g, '');
}

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}
