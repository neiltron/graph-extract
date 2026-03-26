import OpenAI from 'openai';
import type { ChatCompletionCreateParamsNonStreaming } from 'openai/resources/chat/completions';
import { GraphExtractError, ParseError, ProviderError } from './errors.js';
import { parseGraph } from './parse.js';
import { buildPrompt } from './prompt.js';
import { resolveSchema } from './schema.js';
import { compileGraphFromStages } from './staged-compile.js';
import { parseEntityExtraction, parseRelationshipExtraction } from './staged-parse.js';
import {
  type ResponseSchemaDefinition,
  buildEntityPrompt,
  buildEntityResponseSchema,
  buildRelationshipPrompt,
  buildRelationshipResponseSchema,
} from './staged-prompt.js';
import type { EntityExtraction, RelationshipExtraction } from './staged-types.js';
import type {
  ExtractionDebugStage,
  ExtractionMode,
  ExtractionOptions,
  ExtractionResult,
  ExtractorConfig,
  ProviderConfig,
  Schema,
} from './types.js';
import { validate } from './validate.js';

const DEFAULT_TEMPERATURE = 0.3;
const DEFAULT_MAX_TOKENS = 2048;
const DEFAULT_MAX_RETRIES = 2;
const REQUEST_TIMEOUT_MS = 120000;

interface Usage {
  inputTokens: number;
  outputTokens: number;
}

interface LLMResponse {
  content: string;
  finishReason?: string | null;
  usage?: Usage;
}

interface StageResult<T> {
  parsed: T;
  raw: string;
  usage?: Usage;
}

/**
 * Extractor class for reusable graph extraction.
 */
export class Extractor {
  private client: OpenAI;
  private config: ExtractorConfig;

  constructor(config: ExtractorConfig) {
    this.config = config;
    this.client = createOpenAIClient(config.provider);
  }

  /**
   * Extract entities and relationships from text.
   */
  async extract(text: string, options?: ExtractionOptions): Promise<ExtractionResult> {
    if (!text || !text.trim()) {
      throw new GraphExtractError('Input text cannot be empty');
    }

    const schema = resolveSchema(options?.schema ?? this.config.schema);
    const mode = resolveExtractionMode(options?.mode ?? this.config.mode);
    const temperature = options?.temperature ?? this.config.temperature ?? DEFAULT_TEMPERATURE;
    const maxTokens = this.config.maxTokens ?? DEFAULT_MAX_TOKENS;
    const maxRetries = this.config.maxRetries ?? DEFAULT_MAX_RETRIES;

    if (mode === 'staged') {
      return this.extractStaged(text, schema, temperature, maxTokens, maxRetries, {
        includeDebugArtifacts: options?.includeDebugArtifacts ?? false,
      });
    }

    return this.extractSingle(text, schema, temperature, maxTokens, maxRetries);
  }

  private async extractSingle(
    text: string,
    schema: Schema,
    temperature: number,
    maxTokens: number,
    maxRetries: number,
  ): Promise<ExtractionResult> {
    const prompt = buildPrompt(text, schema);
    let lastError: ParseError | undefined;
    let raw = '';
    let previousRaw: string | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      let finishReason: string | null | undefined;

      try {
        const response = await this.callLLM(
          prompt,
          temperature,
          maxTokens,
          buildGraphResponseSchema(schema),
        );
        raw = response.content;
        finishReason = response.finishReason;

        const graph = parseGraph(raw);
        const validationResult = validate(graph);

        return {
          graph: validationResult.graph,
          warnings: validationResult.warnings,
          raw,
          usage: response.usage,
        };
      } catch (e) {
        if (e instanceof ParseError) {
          lastError = annotateParseError(e, finishReason, 'single');

          if (!shouldRetryParseError(raw, previousRaw, finishReason)) {
            break;
          }

          previousRaw = raw;
          continue;
        }

        throw e;
      }
    }

    throw lastError ?? new ParseError('Failed to parse LLM response', raw);
  }

  private async extractStaged(
    text: string,
    schema: Schema,
    temperature: number,
    maxTokens: number,
    maxRetries: number,
    options: { includeDebugArtifacts: boolean },
  ): Promise<ExtractionResult> {
    const entityStage = await this.runStage<EntityExtraction>({
      name: 'entity',
      prompt: buildEntityPrompt(text, schema),
      responseSchema: buildEntityResponseSchema(schema),
      parser: parseEntityExtraction,
      temperature,
      maxTokens,
      maxRetries,
    });

    const relationshipStage = await this.runStage<RelationshipExtraction>({
      name: 'relationship',
      prompt: buildRelationshipPrompt(text, entityStage.parsed, schema),
      responseSchema: buildRelationshipResponseSchema(schema),
      parser: parseRelationshipExtraction,
      temperature,
      maxTokens,
      maxRetries,
    });

    const compiled = compileGraphFromStages({
      entities: entityStage.parsed.entities,
      relationships: relationshipStage.parsed.relationships,
    });
    const validationResult = validate(compiled.graph);

    const result: ExtractionResult = {
      graph: validationResult.graph,
      warnings: [...compiled.warnings, ...validationResult.warnings],
      raw: relationshipStage.raw,
      usage: aggregateUsage(entityStage.usage, relationshipStage.usage),
    };

    if (options.includeDebugArtifacts) {
      result.debug = {
        mode: 'staged',
        stages: buildDebugStages(entityStage, relationshipStage),
        compiled: {
          entities: entityStage.parsed.entities,
          relationships: relationshipStage.parsed.relationships,
          graph: compiled.graph,
        },
      };
    }

    return result;
  }

  private async runStage<T>(options: {
    name: 'entity' | 'relationship';
    prompt: string;
    responseSchema: ResponseSchemaDefinition;
    parser: (raw: string) => T;
    temperature: number;
    maxTokens: number;
    maxRetries: number;
  }): Promise<StageResult<T>> {
    let lastError: ParseError | undefined;
    let raw = '';
    let previousRaw: string | undefined;

    for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
      let finishReason: string | null | undefined;

      try {
        const response = await this.callLLM(
          options.prompt,
          options.temperature,
          options.maxTokens,
          options.responseSchema,
        );
        raw = response.content;
        finishReason = response.finishReason;

        return {
          parsed: options.parser(raw),
          raw,
          usage: response.usage,
        };
      } catch (e) {
        if (e instanceof ParseError) {
          lastError = annotateParseError(e, finishReason, options.name);

          if (!shouldRetryParseError(raw, previousRaw, finishReason)) {
            break;
          }

          previousRaw = raw;
          continue;
        }

        throw e;
      }
    }

    throw lastError ?? new ParseError(`Failed to parse ${options.name} stage response`, raw);
  }

  private async callLLM(
    prompt: string,
    temperature: number,
    maxTokens: number,
    responseSchema: ResponseSchemaDefinition,
  ): Promise<LLMResponse> {
    try {
      const request: ChatCompletionCreateParamsNonStreaming = {
        model: this.config.provider.model,
        messages: [{ role: 'user', content: prompt }],
        temperature,
        max_tokens: maxTokens,
      };

      if (this.config.provider.stop?.length) {
        request.stop = this.config.provider.stop;
      }

      if (this.config.provider.responseFormat) {
        request.response_format = buildResponseFormat(
          this.config.provider.responseFormat,
          responseSchema,
        );
      }

      const response = await this.client.chat.completions.create(request);

      const content = resolveMessageContent(response.choices[0]?.message);
      if (!content) {
        throw new ProviderError('Empty response from LLM');
      }

      return {
        content,
        finishReason: response.choices[0]?.finish_reason,
        usage: response.usage
          ? {
              inputTokens: response.usage.prompt_tokens,
              outputTokens: response.usage.completion_tokens,
            }
          : undefined,
      };
    } catch (e) {
      if (e instanceof ProviderError) {
        throw e;
      }
      if (e instanceof Error) {
        const message = e.message.replace(/sk-[a-zA-Z0-9]+/g, 'sk-***');
        throw new ProviderError(`LLM request failed: ${message}`, e as Error);
      }
      throw new ProviderError('LLM request failed with unknown error');
    }
  }
}

function resolveExtractionMode(mode: ExtractionMode | undefined): ExtractionMode {
  if (!mode) {
    return 'single';
  }

  if (mode === 'single' || mode === 'staged') {
    return mode;
  }

  throw new GraphExtractError(`Unsupported mode: ${mode}`);
}

function buildDebugStages(
  entityStage: StageResult<EntityExtraction>,
  relationshipStage: StageResult<RelationshipExtraction>,
): ExtractionDebugStage[] {
  return [
    {
      name: 'entity',
      raw: entityStage.raw,
      usage: entityStage.usage,
    },
    {
      name: 'relationship',
      raw: relationshipStage.raw,
      usage: relationshipStage.usage,
    },
  ];
}

function aggregateUsage(...usages: Array<Usage | undefined>): Usage | undefined {
  const presentUsages = usages.filter((usage): usage is Usage => usage !== undefined);
  if (presentUsages.length === 0) {
    return undefined;
  }

  return presentUsages.reduce(
    (total, usage) => ({
      inputTokens: total.inputTokens + usage.inputTokens,
      outputTokens: total.outputTokens + usage.outputTokens,
    }),
    { inputTokens: 0, outputTokens: 0 },
  );
}

function shouldRetryParseError(
  raw: string,
  previousRaw: string | undefined,
  finishReason: string | null | undefined,
): boolean {
  if (previousRaw && raw === previousRaw) {
    return false;
  }

  if (finishReason === 'stop' && looksLikeTruncatedJson(raw)) {
    return false;
  }

  return true;
}

function annotateParseError(
  error: ParseError,
  finishReason: string | null | undefined,
  stage: 'single' | 'entity' | 'relationship',
): ParseError {
  const prefix = stage === 'single' ? 'single-pass extraction' : `${stage} stage`;
  const suffix = finishReason ? ` (finish_reason: ${finishReason})` : '';
  return new ParseError(`${prefix}: ${error.message}${suffix}`, error.rawResponse);
}

function looksLikeTruncatedJson(raw: string): boolean {
  const text = raw.trim();
  if (!text.startsWith('{') && !text.startsWith('[')) {
    return false;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (const char of text) {
    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === '{' || char === '[') {
      depth++;
      continue;
    }

    if (char === '}' || char === ']') {
      depth--;
    }
  }

  return inString || depth > 0;
}

const GRAPH_RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['nodes', 'edges'],
  properties: {
    nodes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'label', 'type'],
        properties: {
          id: { type: 'string' },
          label: { type: 'string' },
          type: { type: 'string' },
          metadata: {
            type: 'object',
            additionalProperties: true,
          },
        },
      },
    },
    edges: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'source', 'target', 'type', 'label'],
        properties: {
          id: { type: 'string' },
          source: { type: 'string' },
          target: { type: 'string' },
          type: { type: 'string' },
          label: { type: 'string' },
          metadata: {
            type: 'object',
            additionalProperties: true,
          },
        },
      },
    },
  },
} as const;

function buildGraphResponseSchema(schema: Schema): ResponseSchemaDefinition {
  return {
    name: 'knowledge_graph',
    schema: applyOutputLimits(GRAPH_RESPONSE_SCHEMA, schema),
  };
}

function buildResponseFormat(
  responseFormat: ProviderConfig['responseFormat'],
  responseSchema: ResponseSchemaDefinition,
): ChatCompletionCreateParamsNonStreaming['response_format'] {
  if (responseFormat === 'json_object') {
    return { type: 'json_object' };
  }

  return {
    type: 'json_schema',
    json_schema: {
      name: responseSchema.name,
      strict: true,
      schema: responseSchema.schema,
    },
  };
}

function applyOutputLimits(baseSchema: typeof GRAPH_RESPONSE_SCHEMA, schema: Schema) {
  return {
    ...baseSchema,
    properties: {
      ...baseSchema.properties,
      nodes: {
        ...baseSchema.properties.nodes,
        ...(schema.maxNodes ? { maxItems: schema.maxNodes } : {}),
      },
      edges: {
        ...baseSchema.properties.edges,
        ...(schema.maxEdges ? { maxItems: schema.maxEdges } : {}),
      },
    },
  };
}

function resolveMessageContent(message: unknown): string | undefined {
  if (!message || typeof message !== 'object') {
    return undefined;
  }

  const record = message as Record<string, unknown>;
  const content = normalizeText(record.content);
  if (content) {
    return content;
  }

  return normalizeText(record.reasoning_content) ?? normalizeText(record.reasoningContent);
}

function normalizeText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function createOpenAIClient(provider: ProviderConfig): OpenAI {
  const baseURL = getBaseURL(provider);
  const apiKey = getApiKey(provider);

  return new OpenAI({
    baseURL,
    apiKey,
    timeout: REQUEST_TIMEOUT_MS,
  });
}

function getBaseURL(provider: ProviderConfig): string | undefined {
  if (provider.baseUrl) {
    return provider.baseUrl;
  }

  switch (provider.type) {
    case 'lmstudio':
      return 'http://localhost:1234/v1';
    case 'ollama':
      return 'http://localhost:11434/v1';
    case 'openai':
      return undefined;
    case 'anthropic':
      return undefined;
    default:
      return provider.baseUrl;
  }
}

function getApiKey(provider: ProviderConfig): string {
  if (provider.apiKey) {
    return provider.apiKey;
  }

  switch (provider.type) {
    case 'lmstudio':
    case 'ollama':
      return '';
    case 'openai':
      return process.env.OPENAI_API_KEY ?? '';
    case 'anthropic':
      return process.env.ANTHROPIC_API_KEY ?? '';
    default:
      return '';
  }
}
