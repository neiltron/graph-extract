import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCanvas } from './canvas.js';

const tempDirs: string[] = [];

afterEach(() => {
  for (const directory of tempDirs.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe('runCanvas', () => {
  test('writes a canvas document to the requested output file', () => {
    const directory = mkdtempSync(join(tmpdir(), 'graph-extract-canvas-'));
    tempDirs.push(directory);

    const inputPath = join(directory, 'graph.json');
    const outputPath = join(directory, 'graph.canvas');

    writeFileSync(
      inputPath,
      JSON.stringify({
        nodes: [
          { id: 'node_1', label: 'Alice', type: 'person' },
          { id: 'node_2', label: 'Acme', type: 'organization' },
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
      }),
      'utf-8',
    );

    const exitCode = runCanvas(inputPath, { output: outputPath, pretty: true });
    const canvas = JSON.parse(readFileSync(outputPath, 'utf-8')) as {
      nodes: Array<{ id: string }>;
      edges: Array<{ id: string }>;
    };

    expect(exitCode).toBe(0);
    expect(canvas.nodes).toHaveLength(2);
    expect(canvas.edges).toHaveLength(1);
    expect(canvas.nodes[0]?.id).toBe('node_1');
    expect(canvas.edges[0]?.id).toBe('edge_1');
  });
});
