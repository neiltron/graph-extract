import { describe, expect, test } from 'bun:test';
import { parseRelationSchemaExtraction } from '../src/staged-parse.js';
import { DEFAULT_RELATION_CONSTRAINTS } from '../src/types.js';
import { enforceRelationConstraints } from '../src/validate.js';
import type { Graph } from '../src/types.js';

function graphOf(edges: Array<[string, string, string]>, types: Record<string, string>): Graph {
  const ids = Object.keys(types);
  return {
    nodes: ids.map((id) => ({ id, label: id.replace(/_/g, ' '), type: types[id] ?? 'other' })),
    edges: edges.map(([source, target, type], i) => ({
      id: `edge_${i + 1}`,
      source,
      target,
      type,
      label: type.replace(/_/g, ' '),
    })),
  };
}

describe('enforceRelationConstraints', () => {
  test('drops impossible edges ("Congress created JFK")', () => {
    const graph = graphOf([['congress', 'jfk', 'created']], {
      congress: 'organization',
      jfk: 'person',
    });
    const result = enforceRelationConstraints(graph, DEFAULT_RELATION_CONSTRAINTS);

    expect(result.graph.edges).toHaveLength(0);
    expect(result.warnings[0]?.type).toBe('constraint_violation');
  });

  test('flips repairable edges ("Apollo 11 member_of Armstrong")', () => {
    const graph = graphOf([['apollo', 'armstrong', 'member_of']], {
      apollo: 'event',
      armstrong: 'person',
    });
    const result = enforceRelationConstraints(graph, DEFAULT_RELATION_CONSTRAINTS);

    expect(result.graph.edges).toHaveLength(1);
    expect(result.graph.edges[0]?.source).toBe('armstrong');
    expect(result.graph.edges[0]?.target).toBe('apollo');
    expect(result.warnings[0]?.type).toBe('edge_direction_repaired');
  });

  test('keeps valid edges and unconstrained relations untouched', () => {
    const graph = graphOf(
      [
        ['alice', 'acme', 'works_for'],
        ['alice', 'acme', 'related_to'],
      ],
      { alice: 'person', acme: 'organization' },
    );
    const result = enforceRelationConstraints(graph, DEFAULT_RELATION_CONSTRAINTS);

    expect(result.graph.edges).toHaveLength(2);
    expect(result.warnings).toHaveLength(0);
  });

  test('custom and other entity types always pass', () => {
    const graph = graphOf([['x', 'y', 'works_for']], { x: 'wizard', y: 'other' });
    const result = enforceRelationConstraints(graph, DEFAULT_RELATION_CONSTRAINTS);

    expect(result.graph.edges).toHaveLength(1);
    expect(result.warnings).toHaveLength(0);
  });
});

describe('induced relation constraints', () => {
  test('parses source_types/target_types from the relation-schema stage', () => {
    const parsed = parseRelationSchemaExtraction(
      JSON.stringify({
        relationTypes: [
          {
            name: 'crewed_by',
            description: 'use when the source mission is crewed by the target person',
            source_types: ['Event'],
            target_types: ['person'],
          },
          { name: 'related_to', description: 'fallback', source_types: [] },
        ],
      }),
    );

    expect(parsed.relationTypes[0]?.sourceTypes).toEqual(['event']);
    expect(parsed.relationTypes[0]?.targetTypes).toEqual(['person']);
    expect(parsed.relationTypes[1]?.sourceTypes).toBeUndefined();
  });
});
