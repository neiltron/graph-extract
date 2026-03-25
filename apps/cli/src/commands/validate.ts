import { existsSync, readFileSync } from 'node:fs';
import { type Graph, validate } from '../../../../packages/graph-extract/src/index.js';
import { writeError, writeOutput } from '../utils/io.js';

// Exit codes
const EXIT_SUCCESS = 0;
const EXIT_VALIDATION_ERROR = 2;
const EXIT_FILE_ERROR = 3;

/**
 * Run the validate command.
 */
export function runValidate(filePath: string, pretty?: boolean): number {
  try {
    // Read graph file
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

    // Validate
    const result = validate(graph);

    // Output result
    const output = pretty ? JSON.stringify(result, null, 2) : JSON.stringify(result);
    writeOutput(`${output}\n`);

    // Return appropriate exit code
    return result.valid ? EXIT_SUCCESS : EXIT_VALIDATION_ERROR;
  } catch (e) {
    writeError(`Error: ${(e as Error).message}`);
    return EXIT_FILE_ERROR;
  }
}
