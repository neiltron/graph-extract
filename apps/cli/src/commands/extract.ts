import {
  GraphExtractError,
  ParseError,
  ProviderError,
  extract,
} from '../../../../packages/graph-extract/src/index.js';
import type {
  ExtractionMode,
  ExtractionProgressStage,
  ExtractorConfig,
  ProviderConfig,
  Schema,
} from '../../../../packages/graph-extract/src/types.js';
import { readInput, readSchema, writeError, writeOutput, writeStatus } from '../utils/io.js';

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
  mode?: string;
  relationshipScope?: string;
  maxNodes?: string;
  maxEdges?: string;
  maxTokens?: string;
  requestTimeout?: string;
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
    const showProgress = process.stderr.isTTY;

    let mode: ExtractionMode;
    let relationshipScope: 'global' | 'snippet' | undefined;
    try {
      mode = resolveMode(args.mode ?? process.env.GRAPH_EXTRACT_MODE);
      relationshipScope = resolveRelationshipScope(
        args.relationshipScope ?? process.env.GRAPH_EXTRACT_RELATIONSHIP_SCOPE,
      );
    } catch (e) {
      writeError(`Error: ${(e as Error).message}`);
      return EXIT_CONFIG_ERROR;
    }

    if (showProgress) {
      writeStatus(`[graph-extract] Reading input from ${args.input ? args.input : 'stdin'}...`);
    }

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
      if (showProgress) {
        writeStatus(`[graph-extract] Loading schema from ${args.schema}...`);
      }

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

    if (showProgress) {
      writeStatus(
        `[graph-extract] Starting ${mode} extraction with ${provider.type}/${provider.model}...`,
      );
    }

    let maxTokens: number | undefined;
    try {
      maxTokens = resolvePositiveInteger(
        args.maxTokens ?? process.env.GRAPH_EXTRACT_MAX_TOKENS,
        'max-tokens',
      );
    } catch (e) {
      writeError(`Error: ${(e as Error).message}`);
      return EXIT_CONFIG_ERROR;
    }

    const config: ExtractorConfig = {
      provider,
      schema,
      mode,
      relationshipScope,
      maxTokens,
      onProgress: createProgressReporter(showProgress),
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

    if (showProgress && args.output) {
      writeStatus(`[graph-extract] Wrote graph to ${args.output}`);
    }

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

  const timeoutSeconds = resolvePositiveInteger(
    args.requestTimeout ?? process.env.GRAPH_EXTRACT_REQUEST_TIMEOUT,
    'request-timeout',
  );

  return {
    type,
    baseUrl,
    model,
    apiKey,
    stop,
    responseFormat,
    timeoutMs: timeoutSeconds !== undefined ? timeoutSeconds * 1000 : undefined,
  };
}

function resolveResponseFormat(value?: string): ProviderConfig['responseFormat'] {
  if (!value) {
    return undefined;
  }

  if (value === 'json_object' || value === 'json_schema' || value === 'text') {
    return value;
  }

  throw new GraphExtractError(
    `Unsupported response format: ${value}. Supported values: json_object, json_schema, text`,
  );
}

export function resolveRelationshipScope(value?: string): 'global' | 'snippet' | undefined {
  if (!value) {
    return undefined;
  }

  if (value === 'global' || value === 'snippet') {
    return value;
  }

  throw new GraphExtractError(
    `Unsupported relationship scope: ${value}. Supported values: global, snippet`,
  );
}

export function resolveMode(value?: string): ExtractionMode {
  if (!value) {
    return 'single';
  }

  if (value === 'single' || value === 'staged') {
    return value;
  }

  throw new GraphExtractError(`Unsupported mode: ${value}. Supported values: single, staged`);
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

function createProgressReporter(showProgress: boolean): ExtractorConfig['onProgress'] {
  if (!showProgress) {
    return undefined;
  }

  return (event) => {
    switch (event.type) {
      case 'stage_start':
        writeStatus(`[graph-extract] ${formatStage(event.stage)}...`);
        break;
      case 'stage_complete':
        writeStatus(`[graph-extract] ${formatStage(event.stage, true)}.`);
        break;
      case 'stage_retry':
        writeStatus(
          `[graph-extract] Retrying ${event.stage} stage (attempt ${event.attempt + 1}): ${event.reason}`,
        );
        break;
      case 'compile_start':
        writeStatus('[graph-extract] Compiling final graph...');
        break;
      case 'complete':
        writeStatus(
          `[graph-extract] Extraction complete (${event.nodeCount} nodes, ${event.edgeCount} edges, ${event.warningCount} warnings).`,
        );
        break;
    }
  };
}

function formatStage(stage: ExtractionProgressStage, completed = false): string {
  switch (stage) {
    case 'single':
      return completed ? 'Single-pass extraction complete' : 'Running single-pass extraction';
    case 'entity':
      return completed ? 'Entity extraction stage complete' : 'Running entity extraction stage';
    case 'relation_schema':
      return completed ? 'Relation schema stage complete' : 'Running relation schema stage';
    case 'relationship':
      return completed
        ? 'Relationship extraction stage complete'
        : 'Running relationship extraction stage';
    default:
      return completed ? 'Extraction stage complete' : 'Running extraction stage';
  }
}
