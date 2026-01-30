import { describe, expect, test } from 'bun:test';
import type { Graph } from '../src/types.js';
import { validate } from '../src/validate.js';

describe('validate', () => {
  test('returns valid for a correct graph', () => {
    const graph: Graph = {
      nodes: [
        { id: 'node_1', label: 'Alice', type: 'person' },
        { id: 'node_2', label: 'Bob', type: 'person' },
      ],
      edges: [{ id: 'edge_1', source: 'node_1', target: 'node_2', type: 'knows', label: 'knows' }],
    };

    const result = validate(graph);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
    expect(result.graph.nodes).toHaveLength(2);
    expect(result.graph.edges).toHaveLength(1);
  });

  test('returns valid for empty graph', () => {
    const graph: Graph = { nodes: [], edges: [] };

    const result = validate(graph);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  test('reports error for node missing id', () => {
    const graph = {
      nodes: [
        { id: 'node_1', label: 'Alice', type: 'person' },
        { label: 'Bob', type: 'person' }, // missing id
      ],
      edges: [],
    } as Graph;

    const result = validate(graph);

    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.type).toBe('missing_node_id');
    // The node without id should be filtered out
    expect(result.graph.nodes).toHaveLength(1);
  });

  test('reports error for edge missing id', () => {
    const graph = {
      nodes: [
        { id: 'node_1', label: 'Alice', type: 'person' },
        { id: 'node_2', label: 'Bob', type: 'person' },
      ],
      edges: [{ source: 'node_1', target: 'node_2', type: 'knows', label: 'knows' }], // missing id
    } as Graph;

    const result = validate(graph);

    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.type).toBe('missing_edge_id');
    expect(result.graph.edges).toHaveLength(0);
  });

  test('reports error for duplicate node id', () => {
    const graph: Graph = {
      nodes: [
        { id: 'node_1', label: 'Alice', type: 'person' },
        { id: 'node_1', label: 'Bob', type: 'person' }, // duplicate
      ],
      edges: [],
    };

    const result = validate(graph);

    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.type).toBe('duplicate_id');
  });

  test('reports error for duplicate edge id', () => {
    const graph: Graph = {
      nodes: [
        { id: 'node_1', label: 'Alice', type: 'person' },
        { id: 'node_2', label: 'Bob', type: 'person' },
      ],
      edges: [
        { id: 'edge_1', source: 'node_1', target: 'node_2', type: 'knows', label: 'knows' },
        { id: 'edge_1', source: 'node_2', target: 'node_1', type: 'knows', label: 'knows' }, // duplicate
      ],
    };

    const result = validate(graph);

    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.type).toBe('duplicate_id');
  });

  test('warns and removes edge with invalid source', () => {
    const graph: Graph = {
      nodes: [{ id: 'node_1', label: 'Alice', type: 'person' }],
      edges: [
        {
          id: 'edge_1',
          source: 'node_999', // does not exist
          target: 'node_1',
          type: 'knows',
          label: 'knows',
        },
      ],
    };

    const result = validate(graph);

    expect(result.valid).toBe(true); // warnings don't affect validity
    expect(result.warnings.some((w) => w.type === 'invalid_edge_source')).toBe(true);
    expect(result.warnings.some((w) => w.type === 'removed_edge')).toBe(true);
    expect(result.graph.edges).toHaveLength(0);
  });

  test('warns and removes edge with invalid target', () => {
    const graph: Graph = {
      nodes: [{ id: 'node_1', label: 'Alice', type: 'person' }],
      edges: [
        {
          id: 'edge_1',
          source: 'node_1',
          target: 'node_999', // does not exist
          type: 'knows',
          label: 'knows',
        },
      ],
    };

    const result = validate(graph);

    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.type === 'invalid_edge_target')).toBe(true);
    expect(result.warnings.some((w) => w.type === 'removed_edge')).toBe(true);
    expect(result.graph.edges).toHaveLength(0);
  });

  test('allows self-referencing edges', () => {
    const graph: Graph = {
      nodes: [{ id: 'node_1', label: 'Alice', type: 'person' }],
      edges: [
        { id: 'edge_1', source: 'node_1', target: 'node_1', type: 'self_loop', label: 'self loop' },
      ],
    };

    const result = validate(graph);

    expect(result.valid).toBe(true);
    expect(result.warnings).toHaveLength(0);
    expect(result.graph.edges).toHaveLength(1);
  });

  test('handles multiple errors and warnings', () => {
    const graph = {
      nodes: [
        { id: 'node_1', label: 'Alice', type: 'person' },
        { label: 'No ID', type: 'person' }, // missing id
        { id: 'node_1', label: 'Duplicate', type: 'person' }, // duplicate
      ],
      edges: [
        { id: 'edge_1', source: 'node_1', target: 'node_999', type: 'knows', label: 'knows' }, // invalid target
        { source: 'node_1', target: 'node_1', type: 'self', label: 'self' }, // missing id
      ],
    } as Graph;

    const result = validate(graph);

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});
