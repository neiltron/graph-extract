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
    {"name": "relation_type", "description": "when to use this relation", "source_types": ["person"], "target_types": ["organization"]}
  ]
}

RULES:
1. Output ONLY valid JSON - no markdown code blocks, no explanation, no preamble
2. Return 3 to 8 relation types that best fit the document's explicit relationships
3. Relation names must be lowercase_with_underscores verb phrases that read as a sentence between two entities (works_for, crewed_by, part_of) - never noun phrases (crew_member, landing_location)
4. Prefer generic, reusable semantic labels like uses, improves_upon, compared_to, evaluated_on, trained_on, implemented_with, member_of, produced_by when clearly supported
5. Avoid near-duplicate relation names
6. Always include related_to as a fallback relation
7. Descriptions must be short and state the direction as "use when SOURCE <verb> TARGET", e.g. member_of: use when the source entity belongs to the target entity
8. Do not invent entity-specific relation names
9. source_types / target_types declare which entity types are valid as subject and object of the relation, chosen from: person, organization, location, date, product, event, concept. Use an empty array when any type fits. Example: works_for has source_types ["person"] because only a person works for something

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
4. Direction matters: source_id is the subject and target_id is the object, so the triple must read as a true sentence "<source> <relation> <target>". If Alice works at Acme Corp, output source_id = Alice's ID and target_id = Acme Corp's ID, because "Alice works_for Acme Corp" is true and "Acme Corp works_for Alice" is not
5. Read each relationship back as that sentence before emitting it; if it only makes sense with the entities swapped, swap source_id and target_id
6. Every relationship must cite one supporting snippet_id from the evidence snippets list
7. source_id and target_id must both appear in the cited snippet's entity_ids list
8. Choose the most semantically accurate listed relationship type; if none clearly fit, use related_to
9. Include only relationships explicitly stated in a snippet
10. Prefer precision over recall
11. Do not invent relationships that require combining evidence from multiple snippets
12. If no explicit relationships are present, return an empty relationships array
13. Keep each mention short and grounded in the cited snippet text
${schema.maxEdges ? `14. Return at most ${schema.maxEdges} relationships` : ''}

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
              source_types: { type: 'array', items: { type: 'string' } },
              target_types: { type: 'array', items: { type: 'string' } },
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
      reads: `${relationType.sourceTypes?.join('|').toUpperCase() || 'SOURCE'} ${relationType.name} ${relationType.targetTypes?.join('|').toUpperCase() || 'TARGET'}`,
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
