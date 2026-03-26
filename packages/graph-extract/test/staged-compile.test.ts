import { describe, expect, test } from 'bun:test';
import { compileGraphFromStages } from '../src/staged-compile.js';

describe('compileGraphFromStages', () => {
  test('deduplicates entities by normalized exact-text matching and preserves first label', () => {
    const result = compileGraphFromStages({
      entities: [
        { text: 'Alice', type: 'person', mention: 'Alice' },
        { text: ' alice ', type: 'person', mention: 'alice' },
        { text: 'Acme Corp', type: 'organization', mention: 'Acme Corp' },
      ],
      relationships: [
        { source: 'Alice', target: 'Acme Corp', type: 'works_for', mention: 'works at' },
        { source: 'alice', target: 'Acme Corp', type: 'works for', mention: 'works at' },
      ],
    });

    expect(result.graph.nodes).toEqual([
      { id: 'node_1', label: 'Alice', type: 'person' },
      { id: 'node_2', label: 'Acme Corp', type: 'organization' },
    ]);
    expect(result.graph.edges).toEqual([
      {
        id: 'edge_1',
        source: 'node_1',
        target: 'node_2',
        type: 'works_for',
        label: 'works for',
      },
    ]);
    expect(result.warnings).toHaveLength(0);
  });

  test('drops relationships with unresolved endpoints and emits warnings', () => {
    const result = compileGraphFromStages({
      entities: [{ text: 'Alice', type: 'person', mention: 'Alice' }],
      relationships: [
        { source: 'Alice', target: 'Bob', type: 'knows', mention: 'knows Bob' },
        { source: 'Bob', target: 'Alice', type: 'knows', mention: 'Bob knows Alice' },
      ],
    });

    expect(result.graph.nodes).toHaveLength(1);
    expect(result.graph.edges).toHaveLength(0);
    expect(result.warnings.map((warning) => warning.type)).toEqual([
      'unresolved_relationship_target',
      'unresolved_relationship_source',
    ]);
  });
});
