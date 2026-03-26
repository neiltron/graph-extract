import type { EntityExtraction } from './staged-types.js';
import { DEFAULT_ENTITY_TYPES, DEFAULT_RELATION_TYPES, type Schema } from './types.js';

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

export function buildRelationshipPrompt(
  text: string,
  entityExtraction: EntityExtraction,
  schema: Schema,
): string {
  const relationTypes = schema.relationTypes ?? DEFAULT_RELATION_TYPES;
  const entityList = buildEntityList(entityExtraction);
  const outputLimits = buildRelationshipOutputLimits(schema);

  return `Extract explicit relationships from the text using only the provided entities.

TEXT:
${text}

CANDIDATE ENTITIES:
${entityList}

RELATIONSHIP TYPES: ${relationTypes.join(', ')}
${schema.instructions ? `\nADDITIONAL INSTRUCTIONS:\n${schema.instructions}` : ''}
${outputLimits ? `\nOUTPUT LIMITS:\n${outputLimits}` : ''}

OUTPUT FORMAT:
Return ONLY valid JSON with this exact structure:
{
  "relationships": [
    {"source": "Entity Name", "target": "Entity Name", "type": "relation_type", "mention": "exact mention or short snippet"}
  ]
}

RULES:
1. Output ONLY valid JSON - no markdown code blocks, no explanation, no preamble
2. Use only the listed relationship types
3. Use only the provided candidate entities as relationship endpoints
4. Include only relationships explicitly stated in the text
5. Prefer precision over recall
6. If no explicit relationships are present, return an empty relationships array
7. Keep each mention short and grounded in the source text
${schema.maxEdges ? `8. Return at most ${schema.maxEdges} relationships` : ''}

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

export function buildRelationshipResponseSchema(schema: Schema): ResponseSchemaDefinition {
  const relationTypes = schema.relationTypes ?? DEFAULT_RELATION_TYPES;

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
            required: ['source', 'target', 'type'],
            properties: {
              source: { type: 'string' },
              target: { type: 'string' },
              type: { type: 'string', enum: relationTypes },
              mention: { type: 'string' },
            },
          },
        },
      },
    },
  };
}

function buildEntityList(entityExtraction: EntityExtraction): string {
  if (entityExtraction.entities.length === 0) {
    return '- No candidate entities were found. Return an empty relationships array.';
  }

  return entityExtraction.entities
    .map((entity) => {
      const mention = entity.mention ? ` — mention: ${entity.mention}` : '';
      return `- ${entity.text} (${entity.type})${mention}`;
    })
    .join('\n');
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
