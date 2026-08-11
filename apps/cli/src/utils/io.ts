import { existsSync, readFileSync, writeFileSync } from 'node:fs';

/**
 * Read input from file or stdin.
 */
export async function readInput(filePath?: string): Promise<string> {
  if (filePath) {
    if (!existsSync(filePath)) {
      throw new Error(`Input file not found: ${filePath}`);
    }
    return readFileSync(filePath, 'utf-8');
  }

  // Read from stdin
  return readStdin();
}

/**
 * Read all data from stdin.
 */
async function readStdin(): Promise<string> {
  const chunks: string[] = [];

  for await (const chunk of Bun.stdin.stream()) {
    chunks.push(new TextDecoder().decode(chunk));
  }

  return chunks.join('');
}

/**
 * Write output to file or stdout.
 */
export function writeOutput(data: string, filePath?: string): void {
  if (filePath) {
    writeFileSync(filePath, data, 'utf-8');
  } else {
    process.stdout.write(data);
  }
}

/**
 * Write a message to stderr.
 */
export function writeError(message: string): void {
  process.stderr.write(`${message}\n`);
}

/**
 * Write a status message to stderr without marking it as an error.
 */
export function writeStatus(message: string): void {
  process.stderr.write(`${message}\n`);
}

/**
 * Read and parse a JSON schema file.
 */
export function readSchema(filePath: string): Record<string, unknown> {
  if (!existsSync(filePath)) {
    throw new Error(`Schema file not found: ${filePath}`);
  }

  const content = readFileSync(filePath, 'utf-8');

  try {
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    throw new Error(`Invalid JSON in schema file: ${filePath}`);
  }
}
