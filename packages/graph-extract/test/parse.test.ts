import { describe, expect, test } from 'bun:test';
import { ParseError } from '../src/errors.js';
import { parseGraph } from '../src/parse.js';

describe('parseGraph', () => {
  test('parses valid JSON', () => {
    const raw = JSON.stringify({
      nodes: [{ id: 'node_1', label: 'Alice', type: 'person' }],
      edges: [{ id: 'edge_1', source: 'node_1', target: 'node_2', type: 'knows', label: 'knows' }],
    });

    const graph = parseGraph(raw);

    expect(graph.nodes).toHaveLength(1);
    expect(graph.nodes[0]?.id).toBe('node_1');
    expect(graph.edges).toHaveLength(1);
    expect(graph.edges[0]?.source).toBe('node_1');
  });

  test('strips markdown code fences', () => {
    const raw = `\`\`\`json
{
  "nodes": [{"id": "node_1", "label": "Alice", "type": "person"}],
  "edges": []
}
\`\`\``;

    const graph = parseGraph(raw);

    expect(graph.nodes).toHaveLength(1);
    expect(graph.nodes[0]?.label).toBe('Alice');
  });

  test('strips markdown fences without language specifier', () => {
    const raw = `\`\`\`
{"nodes": [], "edges": []}
\`\`\``;

    const graph = parseGraph(raw);

    expect(graph.nodes).toHaveLength(0);
    expect(graph.edges).toHaveLength(0);
  });

  test('handles trailing commas', () => {
    const raw = `{
      "nodes": [
        {"id": "node_1", "label": "Alice", "type": "person"},
      ],
      "edges": [],
    }`;

    const graph = parseGraph(raw);

    expect(graph.nodes).toHaveLength(1);
  });

  test('extracts JSON from preamble text', () => {
    const raw = `Here's the extracted graph:
{
  "nodes": [{"id": "node_1", "label": "Test", "type": "concept"}],
  "edges": []
}

That's the result.`;

    const graph = parseGraph(raw);

    expect(graph.nodes).toHaveLength(1);
    expect(graph.nodes[0]?.label).toBe('Test');
  });

  test('extracts JSON when valid output is followed by extra tokens', () => {
    const raw = `{
  "nodes": [{"id": "node_1", "label": "Test", "type": "concept"}],
  "edges": []
}

Sure, here are a few additional notes the model should not have added.`;

    const graph = parseGraph(raw);

    expect(graph.nodes).toHaveLength(1);
    expect(graph.edges).toHaveLength(0);
  });

  test('coerces numeric IDs to strings', () => {
    const raw = JSON.stringify({
      nodes: [{ id: 1, label: 'Alice', type: 'person' }],
      edges: [{ id: 1, source: 1, target: 2, type: 'knows', label: 'knows' }],
    });

    const graph = parseGraph(raw);

    expect(graph.nodes[0]?.id).toBe('1');
    expect(graph.edges[0]?.id).toBe('1');
    expect(graph.edges[0]?.source).toBe('1');
    expect(graph.edges[0]?.target).toBe('2');
  });

  test('defaults missing nodes to empty array', () => {
    const raw = JSON.stringify({
      edges: [{ id: 'edge_1', source: 'n1', target: 'n2', type: 'related', label: 'related' }],
    });

    const graph = parseGraph(raw);

    expect(graph.nodes).toHaveLength(0);
    expect(graph.edges).toHaveLength(1);
  });

  test('defaults missing edges to empty array', () => {
    const raw = JSON.stringify({
      nodes: [{ id: 'node_1', label: 'Alice', type: 'person' }],
    });

    const graph = parseGraph(raw);

    expect(graph.nodes).toHaveLength(1);
    expect(graph.edges).toHaveLength(0);
  });

  test('defaults missing type to "other"', () => {
    const raw = JSON.stringify({
      nodes: [{ id: 'node_1', label: 'Unknown' }],
      edges: [],
    });

    const graph = parseGraph(raw);

    expect(graph.nodes[0]?.type).toBe('other');
  });

  test('defaults missing edge type to "related_to"', () => {
    const raw = JSON.stringify({
      nodes: [],
      edges: [{ id: 'edge_1', source: 'n1', target: 'n2' }],
    });

    const graph = parseGraph(raw);

    expect(graph.edges[0]?.type).toBe('related_to');
    expect(graph.edges[0]?.label).toBe('related to');
  });

  test('preserves node metadata', () => {
    const raw = JSON.stringify({
      nodes: [{ id: 'node_1', label: 'Alice', type: 'person', metadata: { age: 30 } }],
      edges: [],
    });

    const graph = parseGraph(raw);

    expect(graph.nodes[0]?.metadata).toEqual({ age: 30 });
  });

  test('preserves edge metadata', () => {
    const raw = JSON.stringify({
      nodes: [],
      edges: [
        {
          id: 'edge_1',
          source: 'n1',
          target: 'n2',
          type: 'works_for',
          label: 'works for',
          metadata: { since: 2020 },
        },
      ],
    });

    const graph = parseGraph(raw);

    expect(graph.edges[0]?.metadata).toEqual({ since: 2020 });
  });

  test('filters out nodes without id', () => {
    const raw = JSON.stringify({
      nodes: [
        { id: 'node_1', label: 'Alice', type: 'person' },
        { label: 'No ID', type: 'person' },
      ],
      edges: [],
    });

    const graph = parseGraph(raw);

    expect(graph.nodes).toHaveLength(1);
  });

  test('filters out edges without required fields', () => {
    const raw = JSON.stringify({
      nodes: [],
      edges: [
        { id: 'edge_1', source: 'n1', target: 'n2', type: 'knows', label: 'knows' },
        { id: 'edge_2', source: 'n1' }, // missing target
        { source: 'n1', target: 'n2' }, // missing id
      ],
    });

    const graph = parseGraph(raw);

    expect(graph.edges).toHaveLength(1);
  });

  test('throws ParseError for invalid JSON', () => {
    const raw = 'not valid json {';

    expect(() => parseGraph(raw)).toThrow(ParseError);
  });

  test('throws ParseError for non-object response', () => {
    const raw = '"just a string"';

    expect(() => parseGraph(raw)).toThrow(ParseError);
  });

  test('ParseError includes raw response', () => {
    const raw = 'invalid json';

    try {
      parseGraph(raw);
      expect(true).toBe(false); // Should not reach here
    } catch (e) {
      expect(e).toBeInstanceOf(ParseError);
      expect((e as ParseError).rawResponse).toBe(raw);
    }
  });

  test('handles nested JSON in explanation text', () => {
    const raw = `I analyzed the text and found the following entities and relationships:

{
  "nodes": [
    {"id": "node_1", "label": "Steve Jobs", "type": "person"},
    {"id": "node_2", "label": "Apple", "type": "organization"}
  ],
  "edges": [
    {"id": "edge_1", "source": "node_1", "target": "node_2", "type": "founded", "label": "founded"}
  ]
}

The graph shows that Steve Jobs founded Apple.`;

    const graph = parseGraph(raw);

    expect(graph.nodes).toHaveLength(2);
    expect(graph.edges).toHaveLength(1);
  });
});
