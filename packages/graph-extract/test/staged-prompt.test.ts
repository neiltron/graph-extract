import { describe, expect, test } from 'bun:test';
import {
  buildEntityPrompt,
  buildEntityResponseSchema,
  buildRelationSchemaPrompt,
  buildRelationSchemaResponseSchema,
  buildRelationshipPrompt,
  buildRelationshipResponseSchema,
} from '../src/staged-prompt.js';

describe('staged prompts', () => {
  test('buildEntityPrompt includes minimal entity output format', () => {
    const prompt = buildEntityPrompt('Alice works at Acme Corp.', {
      entityTypes: ['person', 'organization'],
      maxNodes: 4,
    });

    expect(prompt).toContain('"entities"');
    expect(prompt).toContain('"mention"');
    expect(prompt).toContain('ENTITY TYPES: person, organization');
    expect(prompt).toContain('Return at most 4 entities');
    expect(prompt).toContain('Prefer precision over recall');
  });

  test('buildRelationSchemaPrompt includes entities, snippets, and schema rules', () => {
    const prompt = buildRelationSchemaPrompt(
      [
        { id: 'E1', text: 'Alice', type: 'person', mention: 'Alice' },
        { id: 'E2', text: 'Acme Corp', type: 'organization', mention: 'Acme Corp' },
      ],
      [{ id: 'S1', text: 'Alice works at Acme Corp.', entityIds: ['E1', 'E2'] }],
      {},
    );

    expect(prompt).toContain('ENTITY CATALOG:');
    expect(prompt).toContain('EVIDENCE SNIPPETS:');
    expect(prompt).toContain('"id": "E1"');
    expect(prompt).toContain('"id": "S1"');
    expect(prompt).toContain('Always include related_to as a fallback relation');
    expect(prompt).toContain('verb phrases');
    expect(prompt).toContain('never noun phrases');
  });

  test('buildRelationshipPrompt includes id-based entities, schema, and snippet rules', () => {
    const prompt = buildRelationshipPrompt(
      [
        { id: 'E1', text: 'Alice', type: 'person', mention: 'Alice' },
        { id: 'E2', text: 'Acme Corp', type: 'organization', mention: 'Acme Corp' },
      ],
      [
        { name: 'works_for', description: 'Employment or affiliation relation.' },
        { name: 'related_to', description: 'Fallback relation.' },
      ],
      [{ id: 'S1', text: 'Alice works at Acme Corp.', entityIds: ['E1', 'E2'] }],
      {
        maxEdges: 3,
      },
    );

    expect(prompt).toContain('ENTITY CATALOG:');
    expect(prompt).toContain('RELATIONSHIP SCHEMA:');
    expect(prompt).toContain('EVIDENCE SNIPPETS:');
    expect(prompt).toContain('"id": "E1"');
    expect(prompt).toContain('"name": "works_for"');
    expect(prompt).toContain('"reads": "SOURCE works_for TARGET"');
    expect(prompt).toContain('source_id is the subject and target_id is the object');
    expect(prompt).toContain(
      'Use only entity IDs from the entity catalog as relationship endpoints',
    );
    expect(prompt).toContain('Every relationship must cite one supporting snippet_id');
    expect(prompt).toContain('Return at most 3 relationships');
  });

  test('buildEntityResponseSchema applies enums and maxItems', () => {
    const responseSchema = buildEntityResponseSchema({
      entityTypes: ['person', 'organization'],
      maxNodes: 2,
    });

    expect(responseSchema.name).toBe('entity_extraction');
    expect(responseSchema.schema).toMatchObject({
      properties: {
        entities: {
          maxItems: 2,
          items: {
            properties: {
              type: {
                enum: ['person', 'organization'],
              },
            },
          },
        },
      },
    });
  });

  test('buildRelationSchemaResponseSchema caps relation type definitions', () => {
    const responseSchema = buildRelationSchemaResponseSchema();

    expect(responseSchema.name).toBe('relation_schema_extraction');
    expect(responseSchema.schema).toMatchObject({
      properties: {
        relationTypes: {
          maxItems: 8,
          items: {
            properties: {
              name: { type: 'string' },
              description: { type: 'string' },
            },
          },
        },
      },
    });
  });

  test('buildRelationshipResponseSchema applies relation, entity, and snippet enums', () => {
    const responseSchema = buildRelationshipResponseSchema(
      [
        { name: 'works_for', description: 'Employment or affiliation relation.' },
        { name: 'related_to', description: 'Fallback relation.' },
      ],
      [
        { id: 'E1', text: 'Alice', type: 'person' },
        { id: 'E2', text: 'Acme Corp', type: 'organization' },
      ],
      [{ id: 'S1', text: 'Alice works at Acme Corp.', entityIds: ['E1', 'E2'] }],
      { maxEdges: 2 },
    );

    expect(responseSchema.name).toBe('relationship_extraction');
    expect(responseSchema.schema).toMatchObject({
      properties: {
        relationships: {
          maxItems: 2,
          items: {
            properties: {
              source_id: {
                enum: ['E1', 'E2'],
              },
              target_id: {
                enum: ['E1', 'E2'],
              },
              type: {
                enum: ['works_for', 'related_to'],
              },
              snippet_id: {
                enum: ['S1'],
              },
            },
          },
        },
      },
    });
  });
});
