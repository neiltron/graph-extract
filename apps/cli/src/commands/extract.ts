import {
  type ExtractorConfig,
  GraphExtractError,
  ParseError,
  type ProviderConfig,
  ProviderError,
  type Schema,
  extract,
} from '../../../../packages/graph-extract/src/index.js';
import { readInput, readSchema, writeError, writeOutput } from '../utils/io.js';

export interface ExtractArgs {
  input?: string;
  output?: string;
  schema?: string;
  provider?: string;
  baseUrl?: string;
  model?: string;
  apiKey?: string;
  stop?: string[];
  responseFormat?: string;
  maxNodes?: string;
  maxEdges?: string;
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
          maxNodes: typeof schemaData.maxNodes === 'number' ? schemaData.maxNodes : undefined,
          maxEdges: typeof schemaData.maxEdges === 'number' ? schemaData.maxEdges : undefined,
        };
      } catch (e) {
        writeError(`Error: ${(e as Error).message}`);
        return EXIT_FILE_ERROR;
      }
    }

    try {
      schema = applySchemaOverrides(schema, args);
    } catch (e) {
      writeError(`Error: ${(e as Error).message}`);
      return EXIT_CONFIG_ERROR;
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
      writeError(`Error: ${e.message}`);
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

  const stop = resolveStopSequences(args.stop, process.env.GRAPH_EXTRACT_STOP);

  const responseFormat = resolveResponseFormat(
    args.responseFormat ?? process.env.GRAPH_EXTRACT_RESPONSE_FORMAT,
  );

  return {
    type,
    baseUrl,
    model,
    apiKey,
    stop,
    responseFormat,
  };
}

function resolveResponseFormat(value?: string): ProviderConfig['responseFormat'] {
  if (!value) {
    return undefined;
  }

  if (value === 'json_object' || value === 'json_schema') {
    return value;
  }

  throw new GraphExtractError(
    `Unsupported response format: ${value}. Supported values: json_object, json_schema`,
  );
}

function resolveStopSequences(
  cliStops: string[] | undefined,
  envStops: string | undefined,
): string[] | undefined {
  const values =
    cliStops && cliStops.length > 0
      ? cliStops
      : envStops
        ? envStops
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean)
        : undefined;

  if (!values || values.length === 0) {
    return undefined;
  }

  if (values.length > 4) {
    throw new GraphExtractError('stop supports up to 4 sequences');
  }

  return values;
}

function applySchemaOverrides(schema: Schema | undefined, args: ExtractArgs): Schema | undefined {
  const maxNodes = resolvePositiveInteger(args.maxNodes, 'max-nodes');
  const maxEdges = resolvePositiveInteger(args.maxEdges, 'max-edges');

  if (maxNodes === undefined && maxEdges === undefined) {
    return schema;
  }

  return {
    ...schema,
    maxNodes: maxNodes ?? schema?.maxNodes,
    maxEdges: maxEdges ?? schema?.maxEdges,
  };
}

function resolvePositiveInteger(value: string | undefined, name: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new GraphExtractError(`${name} must be a positive integer`);
  }

  return parsed;
}
