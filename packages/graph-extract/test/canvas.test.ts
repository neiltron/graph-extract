import { describe, expect, test } from 'bun:test';
import { toCanvas } from '../src/canvas.js';
import type { Graph } from '../src/types.js';

describe('toCanvas', () => {
  test('exports graph nodes and edges as Obsidian canvas elements', () => {
    const graph: Graph = {
      nodes: [
        { id: 'node_1', label: 'Alice', type: 'person' },
        { id: 'node_2', label: 'Acme Corp', type: 'organization' },
      ],
      edges: [
        {
          id: 'edge_1',
          source: 'node_1',
          target: 'node_2',
          type: 'works_for',
          label: 'works for',
        },
      ],
    };

    const canvas = toCanvas(graph);

    expect(canvas.nodes).toHaveLength(2);
    expect(canvas.edges).toHaveLength(1);
    expect(canvas.nodes[0]).toMatchObject({
      id: 'node_1',
      type: 'text',
    });
    expect(canvas.nodes[0]?.text).toContain('Type: person');
    expect(canvas.edges[0]).toMatchObject({
      id: 'edge_1',
      fromNode: 'node_1',
      toNode: 'node_2',
      label: 'works for',
    });
  });

  test('lays out a simple chain from left to right by default', () => {
    const graph: Graph = {
      nodes: [
        { id: 'node_1', label: 'Start', type: 'concept' },
        { id: 'node_2', label: 'Middle', type: 'concept' },
        { id: 'node_3', label: 'End', type: 'concept' },
      ],
      edges: [
        {
          id: 'edge_1',
          source: 'node_1',
          target: 'node_2',
          type: 'related_to',
          label: 'related to',
        },
        {
          id: 'edge_2',
          source: 'node_2',
          target: 'node_3',
          type: 'related_to',
          label: 'related to',
        },
      ],
    };

    const canvas = toCanvas(graph);
    const nodeById = new Map(canvas.nodes.map((node) => [node.id, node]));
    const node1 = nodeById.get('node_1');
    const node2 = nodeById.get('node_2');
    const node3 = nodeById.get('node_3');

    expect(node1).toBeDefined();
    expect(node2).toBeDefined();
    expect(node3).toBeDefined();
    expect((node1?.x ?? 0) + (node1?.width ?? 0)).toBeLessThanOrEqual(node2?.x ?? 0);
    expect((node2?.x ?? 0) + (node2?.width ?? 0)).toBeLessThanOrEqual(node3?.x ?? 0);
  });

  test('supports top-to-bottom layout when rankdir is TB', () => {
    const graph: Graph = {
      nodes: [
        { id: 'node_1', label: 'Start', type: 'concept' },
        { id: 'node_2', label: 'End', type: 'concept' },
      ],
      edges: [
        {
          id: 'edge_1',
          source: 'node_1',
          target: 'node_2',
          type: 'related_to',
          label: 'related to',
        },
      ],
    };

    const canvas = toCanvas(graph, { rankdir: 'TB' });
    const nodeById = new Map(canvas.nodes.map((node) => [node.id, node]));
    const start = nodeById.get('node_1');
    const end = nodeById.get('node_2');

    expect(start).toBeDefined();
    expect(end).toBeDefined();
    expect((start?.y ?? 0) + (start?.height ?? 0)).toBeLessThanOrEqual(end?.y ?? 0);
  });

  test('separates disconnected components so their node boxes do not overlap', () => {
    const graph: Graph = {
      nodes: [
        { id: 'a', label: 'A', type: 'concept' },
        { id: 'b', label: 'B', type: 'concept' },
        { id: 'c', label: 'C', type: 'concept' },
        { id: 'd', label: 'D', type: 'concept' },
      ],
      edges: [
        { id: 'edge_1', source: 'a', target: 'b', type: 'related_to', label: 'related to' },
        { id: 'edge_2', source: 'c', target: 'd', type: 'related_to', label: 'related to' },
      ],
    };

    const canvas = toCanvas(graph);
    const componentOne = boundingBox(
      canvas.nodes.filter((node) => node.id === 'a' || node.id === 'b'),
    );
    const componentTwo = boundingBox(
      canvas.nodes.filter((node) => node.id === 'c' || node.id === 'd'),
    );

    expect(boxesOverlap(componentOne, componentTwo)).toBe(false);
  });

  test('ignores duplicate ids and invalid edge references', () => {
    const graph = {
      nodes: [
        { id: 'node_1', label: 'Alice', type: 'person' },
        { id: 'node_1', label: 'Duplicate Alice', type: 'person' },
      ],
      edges: [
        {
          id: 'edge_1',
          source: 'node_1',
          target: 'missing',
          type: 'related_to',
          label: 'related to',
        },
        { id: 'edge_2', source: 'node_1', target: 'node_1', type: 'self_ref', label: 'self ref' },
      ],
    } as Graph;

    const canvas = toCanvas(graph);

    expect(canvas.nodes).toHaveLength(1);
    expect(canvas.nodes[0]?.text).toContain('Alice');
    expect(canvas.edges).toHaveLength(1);
    expect(canvas.edges[0]).toMatchObject({
      id: 'edge_2',
      fromNode: 'node_1',
      toNode: 'node_1',
    });
  });
});

function boundingBox(nodes: Array<{ x: number; y: number; width: number; height: number }>): {
  left: number;
  top: number;
  right: number;
  bottom: number;
} {
  return nodes.reduce(
    (box, node) => ({
      left: Math.min(box.left, node.x),
      top: Math.min(box.top, node.y),
      right: Math.max(box.right, node.x + node.width),
      bottom: Math.max(box.bottom, node.y + node.height),
    }),
    {
      left: Number.POSITIVE_INFINITY,
      top: Number.POSITIVE_INFINITY,
      right: Number.NEGATIVE_INFINITY,
      bottom: Number.NEGATIVE_INFINITY,
    },
  );
}

function boxesOverlap(
  left: { left: number; top: number; right: number; bottom: number },
  right: { left: number; top: number; right: number; bottom: number },
): boolean {
  return !(
    left.right <= right.left ||
    right.right <= left.left ||
    left.bottom <= right.top ||
    right.bottom <= left.top
  );
}
