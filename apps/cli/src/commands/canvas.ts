import { existsSync, readFileSync } from 'node:fs';
import { toCanvas } from '../../../../packages/graph-extract/src/canvas.js';
import type { Graph } from '../../../../packages/graph-extract/src/types.js';
import { writeError, writeOutput } from '../utils/io.js';

export interface CanvasArgs {
  output?: string;
  pretty?: boolean;
}

const EXIT_SUCCESS = 0;
const EXIT_FILE_ERROR = 3;

export function runCanvas(filePath: string, args: CanvasArgs = {}): number {
  try {
    if (!existsSync(filePath)) {
      writeError(`Error: File not found: ${filePath}`);
      return EXIT_FILE_ERROR;
    }

    const content = readFileSync(filePath, 'utf-8');

    let graph: Graph;
    try {
      graph = JSON.parse(content) as Graph;
    } catch {
      writeError(`Error: Invalid JSON in file: ${filePath}`);
      return EXIT_FILE_ERROR;
    }

    const canvas = toCanvas(graph);
    const output = args.pretty ? JSON.stringify(canvas, null, 2) : JSON.stringify(canvas);
    writeOutput(`${output}\n`, args.output);

    return EXIT_SUCCESS;
  } catch (error) {
    writeError(`Error: ${(error as Error).message}`);
    return EXIT_FILE_ERROR;
  }
}
