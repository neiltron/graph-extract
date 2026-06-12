import type { CatalogEntity, RelationTypeDefinition, RelationshipSnippet } from './staged-types.js';
import { DEFAULT_ENTITY_TYPES, type Schema } from './types.js';

export interface ResponseSchemaDefinition {
  name: string;
  schema: Record<string, unknown>;
}

export function buildEntityPrompt(text: string, schema: Schema): string {
  const entityTypes = schema.entityTypes ?? DEFAULT_ENTITY_TYPES;
  const outputLimits = buildEntityOutputLimits(schema);

  return `Extract the most important explicit entities from the text.

TEXT:
${text}

ENTITY TYPES: ${entityTypes.join(', ')}
${schema.instructions ? `\nADDITIONAL INSTRUCTIONS:\n${schema.instructions}` : ''}
${outputLimits ? `\nOUTPUT LIMITS:\n${outputLimits}` : ''}

OUTPUT FORMAT:
Return ONLY valid JSON with this exact structure:
{
  "entities": [
    {"text": "Entity Name", "type": "entity_type", "mention": "exact mention or short snippet"}
  ]
}

RULES:
1. Output ONLY valid JSON - no markdown code blocks, no explanation, no preamble
2. Use only the listed entity types
3. Include only entities explicitly stated in the text
4. Prefer precision over recall
5. Deduplicate identical entities by text
6. Keep each mention short and grounded in the source text
${schema.maxNodes ? `7. Return at most ${schema.maxNodes} entities` : ''}

JSON:`;
}

export function buildRelationSchemaPrompt(
  entities: CatalogEntity[],
  snippets: RelationshipSnippet[],
  schema: Schema,
): string {
  const entityList = buildEntityList(entities);
  const snippetList = buildSnippetList(snippets);

  return `Infer a compact relationship schema for a salient knowledge graph over the provided entities and evidence snippets.

ENTITY CATALOG:
${entityList}

EVIDENCE SNIPPETS:
${snippetList}
${schema.instructions ? `\nADDITIONAL INSTRUCTIONS:\n${schema.instructions}` : ''}

OUTPUT FORMAT:
Return ONLY valid JSON with this exact structure:
{
  "relationTypes": [
    {"name": "relation_type", "description": "when to use this relation"}
  ]
}

RULES:
1. Output ONLY valid JSON - no markdown code blocks, no explanation, no preamble
2. Return 3 to 8 relation types that best fit the document's explicit relationships
3. Relation names must be lowercase_with_underscores
4. Prefer generic, reusable semantic labels like uses, improves_upon, compared_to, evaluated_on, trained_on, implemented_with, member_of, produced_by when clearly supported
5. Avoid near-duplicate relation names
6. Always include related_to as a fallback relation
7. Descriptions should be short and explain when the relation should be used in this document
8. Do not invent entity-specific relation names

JSON:`;
}

export function buildRelationshipPrompt(
  entities: CatalogEntity[],
  relationTypes: RelationTypeDefinition[],
  snippets: RelationshipSnippet[],
  schema: Schema,
): string {
  const entityList = buildEntityList(entities);
  const relationTypeList = buildRelationTypeList(relationTypes);
  const snippetList = buildSnippetList(snippets);
  const outputLimits = buildRelationshipOutputLimits(schema);

  return `Extract explicit relationships from the evidence snippets using only the provided entity IDs and relationship schema.

ENTITY CATALOG:
${entityList}

RELATIONSHIP SCHEMA:
${relationTypeList}

EVIDENCE SNIPPETS:
${snippetList}
${schema.instructions ? `\nADDITIONAL INSTRUCTIONS:\n${schema.instructions}` : ''}
${outputLimits ? `\nOUTPUT LIMITS:\n${outputLimits}` : ''}

OUTPUT FORMAT:
Return ONLY valid JSON with this exact structure:
{
  "relationships": [
    {"source_id": "E1", "target_id": "E2", "type": "relation_type", "snippet_id": "S1", "mention": "exact mention or short snippet"}
  ]
}

RULES:
1. Output ONLY valid JSON - no markdown code blocks, no explanation, no preamble
2. Use only the listed relationship types
3. Use only entity IDs from the entity catalog as relationship endpoints
4. Every relationship must cite one supporting snippet_id from the evidence snippets list
5. source_id and target_id must both appear in the cited snippet's entity_ids list
6. Choose the most semantically accurate listed relationship type; if none clearly fit, use related_to
7. Include only relationships explicitly stated in a snippet
8. Prefer precision over recall
9. Do not invent relationships that require combining evidence from multiple snippets
10. If no explicit relationships are present, return an empty relationships array
11. Keep each mention short and grounded in the cited snippet text
${schema.maxEdges ? `12. Return at most ${schema.maxEdges} relationships` : ''}

JSON:`;
}

export function buildEntityResponseSchema(schema: Schema): ResponseSchemaDefinition {
  const entityTypes = schema.entityTypes ?? DEFAULT_ENTITY_TYPES;

  return {
    name: 'entity_extraction',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['entities'],
      properties: {
        entities: {
          type: 'array',
          ...(schema.maxNodes ? { maxItems: schema.maxNodes } : {}),
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['text', 'type'],
            properties: {
              text: { type: 'string' },
              type: { type: 'string', enum: entityTypes },
              mention: { type: 'string' },
            },
          },
        },
      },
    },
  };
}

export function buildRelationSchemaResponseSchema(): ResponseSchemaDefinition {
  return {
    name: 'relation_schema_extraction',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['relationTypes'],
      properties: {
        relationTypes: {
          type: 'array',
          minItems: 1,
          maxItems: 8,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['name', 'description'],
            properties: {
              name: { type: 'string' },
              description: { type: 'string' },
            },
          },
        },
      },
    },
  };
}

export function buildRelationshipResponseSchema(
  relationTypes: RelationTypeDefinition[],
  entities: CatalogEntity[],
  snippets: RelationshipSnippet[],
  schema: Schema,
): ResponseSchemaDefinition {
  const relationTypeNames = relationTypes.map((relationType) => relationType.name);
  const entityIds = entities.map((entity) => entity.id);
  const snippetIds = snippets.map((snippet) => snippet.id);

  return {
    name: 'relationship_extraction',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['relationships'],
      properties: {
        relationships: {
          type: 'array',
          ...(schema.maxEdges ? { maxItems: schema.maxEdges } : {}),
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['source_id', 'target_id', 'type', 'snippet_id'],
            properties: {
              source_id: { type: 'string', enum: entityIds },
              target_id: { type: 'string', enum: entityIds },
              type: { type: 'string', enum: relationTypeNames },
              snippet_id: { type: 'string', enum: snippetIds },
              mention: { type: 'string' },
            },
          },
        },
      },
    },
  };
}

function buildEntityList(entities: CatalogEntity[]): string {
  if (entities.length === 0) {
    return '[]';
  }

  return JSON.stringify(
    entities.map((entity) => ({
      id: entity.id,
      text: entity.text,
      type: entity.type,
      ...(entity.mention ? { mention: entity.mention } : {}),
    })),
    null,
    2,
  );
}

function buildEntityOutputLimits(schema: Schema): string {
  const lines: string[] = [];

  if (schema.maxNodes) {
    lines.push(`- max entities: ${schema.maxNodes}`);
  }

  return lines.join('\n');
}

function buildRelationshipOutputLimits(schema: Schema): string {
  const lines: string[] = [];

  if (schema.maxEdges) {
    lines.push(`- max relationships: ${schema.maxEdges}`);
  }

  return lines.join('\n');
}

function buildRelationTypeList(relationTypes: RelationTypeDefinition[]): string {
  return JSON.stringify(
    relationTypes.map((relationType) => ({
      name: relationType.name,
      ...(relationType.description ? { description: relationType.description } : {}),
    })),
    null,
    2,
  );
}

function buildSnippetList(snippets: RelationshipSnippet[]): string {
  if (snippets.length === 0) {
    return '[]';
  }

  return JSON.stringify(
    snippets.map((snippet) => ({
      id: snippet.id,
      entity_ids: snippet.entityIds,
      text: snippet.text,
    })),
    null,
    2,
  );
}
