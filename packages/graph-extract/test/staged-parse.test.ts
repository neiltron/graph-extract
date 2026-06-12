import { describe, expect, test } from 'bun:test';
import { parseRelationSchemaExtraction, parseRelationshipExtraction } from '../src/staged-parse.js';

describe('staged parse helpers', () => {
  test('parseRelationSchemaExtraction normalizes and deduplicates relation types', () => {
    const parsed = parseRelationSchemaExtraction(`{
      "relationTypes": [
        {"name": "Uses", "description": "Uses another tool"},
        {"name": "uses", "description": "duplicate"},
        "improves_upon"
      ]
    }`);

    expect(parsed.relationTypes).toEqual([
      { name: 'uses', description: 'Uses another tool' },
      { name: 'improves_upon' },
      {
        name: 'related_to',
        description: 'Fallback relation when no more specific listed type clearly fits.',
      },
    ]);
  });

  test('parseRelationshipExtraction supports id-based and legacy text endpoints', () => {
    const parsed = parseRelationshipExtraction(`{
      "relationships": [
        {
          "source_id": "E1",
          "target_id": "E2",
          "type": "works_for",
          "snippet_id": "S1",
          "mention": "works at"
        },
        {
          "source": "Alice",
          "target": "Acme Corp",
          "type": "related_to"
        }
      ]
    }`);

    expect(parsed.relationships).toEqual([
      {
        sourceId: 'E1',
        targetId: 'E2',
        source: undefined,
        target: undefined,
        type: 'works_for',
        mention: 'works at',
        snippetId: 'S1',
      },
      {
        sourceId: undefined,
        targetId: undefined,
        source: 'Alice',
        target: 'Acme Corp',
        type: 'related_to',
        mention: undefined,
        snippetId: undefined,
      },
    ]);
  });
});
