import { describe, expect, test } from 'bun:test';
import { enforceGraphLimits } from '../src/validate.js';
import type { Graph } from '../src/types.js';

function makeGraph(nodeCount: number, edges: Array<[string, string]>): Graph {
  return {
    nodes: Array.from({ length: nodeCount }, (_, i) => ({
      id: `node_${i + 1}`,
      label: `Node ${i + 1}`,
      type: 'concept',
    })),
    edges: edges.map(([source, target], i) => ({
      id: `edge_${i + 1}`,
      source,
      target,
      type: 'related_to',
      label: 'related to',
    })),
  };
}

describe('enforceGraphLimits', () => {
  test('returns graph unchanged when within limits', () => {
    const graph = makeGraph(3, [['node_1', 'node_2']]);
    const result = enforceGraphLimits(graph, { maxNodes: 5, maxEdges: 5 });

    expect(result.graph).toBe(graph);
    expect(result.warnings).toHaveLength(0);
  });

  test('returns graph unchanged when no limits are set', () => {
    const graph = makeGraph(10, []);
    const result = enforceGraphLimits(graph, {});

    expect(result.graph).toBe(graph);
    expect(result.warnings).toHaveLength(0);
  });

  test('trims lowest-degree nodes first and drops orphaned edges', () => {
    // node_1 has degree 3, node_2/3/4 have degree 1, node_5 has degree 0
    const graph = makeGraph(5, [
      ['node_1', 'node_2'],
      ['node_1', 'node_3'],
      ['node_1', 'node_4'],
    ]);
    const result = enforceGraphLimits(graph, { maxNodes: 3 });

    expect(result.graph.nodes.map((n) => n.id)).toEqual(['node_1', 'node_2', 'node_3']);
    expect(result.graph.edges.map((e) => e.id)).toEqual(['edge_1', 'edge_2']);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]?.type).toBe('graph_truncated');
  });

  test('preserves original order among equal-degree nodes', () => {
    const graph = makeGraph(4, []);
    const result = enforceGraphLimits(graph, { maxNodes: 2 });

    expect(result.graph.nodes.map((n) => n.id)).toEqual(['node_1', 'node_2']);
  });

  test('trims edges beyond maxEdges in original order', () => {
    const graph = makeGraph(3, [
      ['node_1', 'node_2'],
      ['node_2', 'node_3'],
      ['node_1', 'node_3'],
    ]);
    const result = enforceGraphLimits(graph, { maxEdges: 2 });

    expect(result.graph.nodes).toHaveLength(3);
    expect(result.graph.edges.map((e) => e.id)).toEqual(['edge_1', 'edge_2']);
    expect(result.warnings).toHaveLength(1);
  });

  test('applies node and edge limits together', () => {
    const graph = makeGraph(5, [
      ['node_1', 'node_2'],
      ['node_1', 'node_3'],
      ['node_2', 'node_3'],
      ['node_4', 'node_5'],
    ]);
    const result = enforceGraphLimits(graph, { maxNodes: 3, maxEdges: 2 });

    expect(result.graph.nodes.map((n) => n.id)).toEqual(['node_1', 'node_2', 'node_3']);
    expect(result.graph.edges).toHaveLength(2);
    for (const edge of result.graph.edges) {
      expect(['node_1', 'node_2', 'node_3']).toContain(edge.source);
      expect(['node_1', 'node_2', 'node_3']).toContain(edge.target);
    }
  });
});
