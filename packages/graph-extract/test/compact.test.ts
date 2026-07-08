import { describe, expect, test } from 'bun:test';
import { compactGraph } from '../src/validate.js';
import type { Graph } from '../src/types.js';

function graphWith(isolatedCount: number): Graph {
  return {
    nodes: [
      { id: 'node_1', label: 'Alice', type: 'person' },
      { id: 'node_2', label: 'Acme', type: 'organization' },
      ...Array.from({ length: isolatedCount }, (_, i) => ({
        id: `node_iso_${i + 1}`,
        label: `Floater ${i + 1}`,
        type: 'concept',
      })),
    ],
    edges: [
      { id: 'edge_1', source: 'node_1', target: 'node_2', type: 'works_for', label: 'works for' },
    ],
  };
}

describe('compactGraph', () => {
  test('returns graph unchanged with no isolated nodes', () => {
    const graph = graphWith(0);
    const result = compactGraph(graph, {});

    expect(result.graph).toBe(graph);
    expect(result.warnings).toHaveLength(0);
  });

  test('warns without pruning by default', () => {
    const graph = graphWith(2);
    const result = compactGraph(graph, {});

    expect(result.graph.nodes).toHaveLength(4);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]?.type).toBe('isolated_nodes');
    expect(result.warnings[0]?.message).toContain('Floater 1');
  });

  test('prunes isolated nodes when asked', () => {
    const graph = graphWith(2);
    const result = compactGraph(graph, { pruneIsolatedNodes: true });

    expect(result.graph.nodes.map((n) => n.id)).toEqual(['node_1', 'node_2']);
    expect(result.graph.edges).toHaveLength(1);
    expect(result.warnings[0]?.message).toContain('Pruned 2');
  });
});
