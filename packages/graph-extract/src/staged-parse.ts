import { parseJsonObject } from './parse.js';
import type {
  EntityExtraction,
  ExtractedEntity,
  ExtractedRelationship,
  RelationSchemaExtraction,
  RelationTypeDefinition,
  RelationshipExtraction,
} from './staged-types.js';

export function parseEntityExtraction(raw: string): EntityExtraction {
  const parsed = parseJsonObject(raw);
  const rawEntities = Array.isArray(parsed.entities)
    ? parsed.entities
    : Array.isArray(parsed.nodes)
      ? parsed.nodes
      : [];

  return {
    entities: rawEntities
      .map(normalizeEntity)
      .filter((entity): entity is ExtractedEntity => entity !== null),
  };
}

export function parseRelationSchemaExtraction(raw: string): RelationSchemaExtraction {
  const parsed = parseJsonObject(raw);
  const rawRelationTypes = Array.isArray(parsed.relationTypes)
    ? parsed.relationTypes
    : Array.isArray(parsed.relation_types)
      ? parsed.relation_types
      : Array.isArray(parsed.relations)
        ? parsed.relations
        : [];

  const relationTypes = rawRelationTypes
    .map(normalizeRelationTypeDefinition)
    .filter((relationType): relationType is RelationTypeDefinition => relationType !== null);

  return {
    relationTypes: ensureFallbackRelationType(dedupeRelationTypes(relationTypes)),
  };
}

export function parseRelationshipExtraction(raw: string): RelationshipExtraction {
  const parsed = parseJsonObject(raw);
  const rawRelationships = Array.isArray(parsed.relationships)
    ? parsed.relationships
    : Array.isArray(parsed.edges)
      ? parsed.edges
      : [];

  return {
    relationships: rawRelationships
      .map(normalizeRelationship)
      .filter((relationship): relationship is ExtractedRelationship => relationship !== null),
  };
}

function normalizeEntity(raw: unknown): ExtractedEntity | null {
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }

  const obj = raw as Record<string, unknown>;
  const text = normalizeText(obj.text ?? obj.label);

  if (!text) {
    return null;
  }

  return {
    text,
    type: normalizeText(obj.type) ?? 'other',
    mention: normalizeText(obj.mention ?? obj.snippet),
  };
}

function normalizeRelationTypeDefinition(raw: unknown): RelationTypeDefinition | null {
  if (typeof raw === 'string') {
    const name = normalizeRelationType(raw);
    return name ? { name } : null;
  }

  if (typeof raw !== 'object' || raw === null) {
    return null;
  }

  const obj = raw as Record<string, unknown>;
  const name = normalizeRelationType(obj.name ?? obj.type ?? obj.label);
  if (!name) {
    return null;
  }

  return {
    name,
    description: normalizeText(obj.description ?? obj.summary),
  };
}

function normalizeRelationship(raw: unknown): ExtractedRelationship | null {
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }

  const obj = raw as Record<string, unknown>;
  const sourceId = normalizeText(obj.source_id ?? obj.sourceId);
  const targetId = normalizeText(obj.target_id ?? obj.targetId);
  const source = normalizeText(obj.source ?? obj.from);
  const target = normalizeText(obj.target ?? obj.to);

  if (!sourceId && !source) {
    return null;
  }

  if (!targetId && !target) {
    return null;
  }

  return {
    sourceId,
    targetId,
    source,
    target,
    type: normalizeRelationType(obj.type),
    mention: normalizeText(obj.mention ?? obj.snippet),
    snippetId: normalizeText(obj.snippet_id ?? obj.snippetId),
  };
}

function normalizeText(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();
  return normalized ? normalized : undefined;
}

function normalizeRelationType(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    return 'related_to';
  }

  return value.trim().toLowerCase().replace(/\s+/g, '_');
}

function dedupeRelationTypes(relationTypes: RelationTypeDefinition[]): RelationTypeDefinition[] {
  const seen = new Set<string>();
  const deduped: RelationTypeDefinition[] = [];

  for (const relationType of relationTypes) {
    if (seen.has(relationType.name)) {
      continue;
    }

    seen.add(relationType.name);
    deduped.push(relationType);
  }

  return deduped;
}

function ensureFallbackRelationType(
  relationTypes: RelationTypeDefinition[],
): RelationTypeDefinition[] {
  const withoutFallback = relationTypes.filter(
    (relationType) => relationType.name !== 'related_to',
  );

  return [
    ...withoutFallback,
    {
      name: 'related_to',
      description: 'Fallback relation when no more specific listed type clearly fits.',
    },
  ];
}
