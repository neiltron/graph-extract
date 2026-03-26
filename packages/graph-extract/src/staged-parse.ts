import { parseJsonObject } from './parse.js';
import type {
  EntityExtraction,
  ExtractedEntity,
  ExtractedRelationship,
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

function normalizeRelationship(raw: unknown): ExtractedRelationship | null {
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }

  const obj = raw as Record<string, unknown>;
  const source = normalizeText(obj.source ?? obj.from);
  const target = normalizeText(obj.target ?? obj.to);

  if (!source || !target) {
    return null;
  }

  return {
    source,
    target,
    type: normalizeRelationType(obj.type),
    mention: normalizeText(obj.mention ?? obj.snippet),
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
