import {
  type ExtractorConfig,
  GraphExtractError,
  ParseError,
  type ProviderConfig,
  ProviderError,
  type Schema,
  extract,
} from '@graph-extract/core';
import { readInput, readSchema, writeError, writeOutput } from '../utils/io.js';

export interface ExtractArgs {
  input?: string;
  output?: string;
  schema?: string;
  provider?: string;
  baseUrl?: string;
  model?: string;
  apiKey?: string;
  pretty?: boolean;
}

// Exit codes
const EXIT_SUCCESS = 0;
const EXIT_EXTRACTION_ERROR = 1;
const EXIT_FILE_ERROR = 3;
const EXIT_CONFIG_ERROR = 4;

/**
 * Run the extract command.
 */
export async function runExtract(args: ExtractArgs): Promise<number> {
  try {
    // Read input text
    let text: string;
    try {
      text = await readInput(args.input);
    } catch (e) {
      writeError(`Error: ${(e as Error).message}`);
      return EXIT_FILE_ERROR;
    }

    if (!text.trim()) {
      writeError('Error: Input text is empty');
      return EXIT_EXTRACTION_ERROR;
    }

    // Build schema
    let schema: Schema | undefined;
    if (args.schema) {
      try {
        const schemaData = readSchema(args.schema);
        schema = {
          entityTypes: Array.isArray(schemaData.entityTypes)
            ? (schemaData.entityTypes as string[])
            : undefined,
          relationTypes: Array.isArray(schemaData.relationTypes)
            ? (schemaData.relationTypes as string[])
            : undefined,
          instructions:
            typeof schemaData.instructions === 'string' ? schemaData.instructions : undefined,
        };
      } catch (e) {
        writeError(`Error: ${(e as Error).message}`);
        return EXIT_FILE_ERROR;
      }
    }

    // Build provider config
    const provider = resolveProvider(args);
    if (!provider.model) {
      writeError('Error: Model is required. Use --model or set GRAPH_EXTRACT_MODEL');
      return EXIT_CONFIG_ERROR;
    }

    const config: ExtractorConfig = {
      provider,
      schema,
    };

    // Perform extraction
    const result = await extract(text, config);

    // Output warnings to stderr
    for (const warning of result.warnings) {
      writeError(`Warning: ${warning.message}`);
    }

    // Output graph to stdout or file
    const output = args.pretty
      ? JSON.stringify(result.graph, null, 2)
      : JSON.stringify(result.graph);
    writeOutput(`${output}\n`, args.output);

    return EXIT_SUCCESS;
  } catch (e) {
    if (e instanceof ParseError) {
      writeError('Error: Failed to parse LLM response');
      writeError(`Raw response: ${e.rawResponse.slice(0, 200)}...`);
      return EXIT_EXTRACTION_ERROR;
    }

    if (e instanceof ProviderError) {
      writeError(`Error: ${e.message}`);
      return EXIT_EXTRACTION_ERROR;
    }

    if (e instanceof GraphExtractError) {
      writeError(`Error: ${e.message}`);
      return EXIT_EXTRACTION_ERROR;
    }

    writeError(`Error: ${(e as Error).message}`);
    return EXIT_EXTRACTION_ERROR;
  }
}

/**
 * Resolve provider configuration from args and environment.
 */
export function resolveProvider(args: ExtractArgs): ProviderConfig {
  const type = args.provider ?? process.env.GRAPH_EXTRACT_PROVIDER ?? 'lmstudio';

  const baseUrl = args.baseUrl ?? process.env.GRAPH_EXTRACT_BASE_URL;

  const model = args.model ?? process.env.GRAPH_EXTRACT_MODEL ?? '';

  const apiKey = args.apiKey ?? process.env.GRAPH_EXTRACT_API_KEY;

  return {
    type,
    baseUrl,
    model,
    apiKey,
  };
}
