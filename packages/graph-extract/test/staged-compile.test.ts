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

  test('resolves relationship endpoints that include copied type labels and mention aliases', () => {
    const result = compileGraphFromStages({
      entities: [
        { text: 'Spectrum', type: 'product', mention: 'Spectrum' },
        {
          text: 'Large Language Models',
          type: 'concept',
          mention: 'LLMs',
        },
        {
          text: 'LoRA',
          type: 'product',
          mention: 'Low-Rank Adaptation',
        },
      ],
      relationships: [
        {
          source: 'Spectrum (product)',
          target: 'Large Language Models (concept)',
          type: 'related_to',
        },
        {
          source: 'Spectrum',
          target: 'Large Language Models (LLMs)',
          type: 'related_to',
        },
        {
          source: 'Spectrum',
          target: 'Low-Rank Adaptation (LoRA)',
          type: 'related_to',
        },
      ],
    });

    expect(result.graph.nodes).toEqual([
      { id: 'node_1', label: 'Spectrum', type: 'product' },
      { id: 'node_2', label: 'Large Language Models', type: 'concept' },
      { id: 'node_3', label: 'LoRA', type: 'product' },
    ]);
    expect(result.graph.edges).toEqual([
      {
        id: 'edge_1',
        source: 'node_1',
        target: 'node_2',
        type: 'related_to',
        label: 'related to',
      },
      {
        id: 'edge_2',
        source: 'node_1',
        target: 'node_3',
        type: 'related_to',
        label: 'related to',
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
