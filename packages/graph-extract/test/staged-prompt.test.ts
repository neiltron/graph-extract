import { describe, expect, test } from 'bun:test';
import {
  buildEntityPrompt,
  buildEntityResponseSchema,
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

  test('buildRelationshipPrompt includes candidate entities and relationship rules', () => {
    const prompt = buildRelationshipPrompt(
      'Alice works at Acme Corp.',
      {
        entities: [
          { text: 'Alice', type: 'person', mention: 'Alice' },
          { text: 'Acme Corp', type: 'organization', mention: 'Acme Corp' },
        ],
      },
      {
        relationTypes: ['works_for', 'owns'],
        maxEdges: 3,
      },
    );

    expect(prompt).toContain('CANDIDATE ENTITIES:');
    expect(prompt).toContain('- Alice (person) — mention: Alice');
    expect(prompt).toContain('RELATIONSHIP TYPES: works_for, owns');
    expect(prompt).toContain('Use only the provided candidate entities as relationship endpoints');
    expect(prompt).toContain('Return at most 3 relationships');
  });

  test('buildRelationshipPrompt handles empty candidate entity lists', () => {
    const prompt = buildRelationshipPrompt('No entities here.', { entities: [] }, {});

    expect(prompt).toContain('No candidate entities were found');
    expect(prompt).toContain('Return an empty relationships array');
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

  test('buildRelationshipResponseSchema applies enums and maxItems', () => {
    const responseSchema = buildRelationshipResponseSchema({
      relationTypes: ['works_for', 'owns'],
      maxEdges: 2,
    });

    expect(responseSchema.name).toBe('relationship_extraction');
    expect(responseSchema.schema).toMatchObject({
      properties: {
        relationships: {
          maxItems: 2,
          items: {
            properties: {
              type: {
                enum: ['works_for', 'owns'],
              },
            },
          },
        },
      },
    });
  });
});
