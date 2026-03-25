import OpenAI from 'openai';
import type { ChatCompletionCreateParamsNonStreaming } from 'openai/resources/chat/completions';
import { GraphExtractError, ParseError, ProviderError } from './errors.js';
import { parseGraph } from './parse.js';
import { buildPrompt } from './prompt.js';
import { resolveSchema } from './schema.js';
import type {
  ExtractionOptions,
  ExtractionResult,
  ExtractorConfig,
  ProviderConfig,
  Schema,
} from './types.js';
import { validate } from './validate.js';

const DEFAULT_TEMPERATURE = .3;
const DEFAULT_MAX_TOKENS = 2048;
const DEFAULT_MAX_RETRIES = 2;
const REQUEST_TIMEOUT_MS = 120000;

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
    // Validate input
    if (!text || !text.trim()) {
      throw new GraphExtractError('Input text cannot be empty');
    }

    const schema = resolveSchema(options?.schema ?? this.config.schema);
    const prompt = buildPrompt(text, schema);
    const temperature = options?.temperature ?? this.config.temperature ?? DEFAULT_TEMPERATURE;
    const maxTokens = this.config.maxTokens ?? DEFAULT_MAX_TOKENS;
    const maxRetries = this.config.maxRetries ?? DEFAULT_MAX_RETRIES;

    let lastError: ParseError | undefined;
    let raw = '';
    let previousRaw: string | undefined;

    // Try extraction with retries
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      let finishReason: string | null | undefined;

      try {
        const response = await this.callLLM(prompt, schema, temperature, maxTokens);
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
          lastError = annotateParseError(e, finishReason);

          if (!shouldRetryParseError(raw, previousRaw, finishReason)) {
            break;
          }

          previousRaw = raw;
          // Continue to retry
        } else {
          throw e;
        }
      }
    }

    // All retries exhausted
    throw lastError ?? new ParseError('Failed to parse LLM response', raw);
  }

  private async callLLM(
    prompt: string,
    schema: Schema,
    temperature: number,
    maxTokens: number,
  ): Promise<{
    content: string;
    finishReason?: string | null;
    usage?: { inputTokens: number; outputTokens: number };
  }> {
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
        request.response_format = buildResponseFormat(this.config.provider.responseFormat, schema);
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
        // Mask API key in error messages
        const message = e.message.replace(/sk-[a-zA-Z0-9]+/g, 'sk-***');
        throw new ProviderError(`LLM request failed: ${message}`, e as Error);
      }
      throw new ProviderError('LLM request failed with unknown error');
    }
  }
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
): ParseError {
  if (!finishReason) {
    return error;
  }

  return new ParseError(`${error.message} (finish_reason: ${finishReason})`, error.rawResponse);
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

function buildResponseFormat(
  responseFormat: ProviderConfig['responseFormat'],
  schema: Schema,
): ChatCompletionCreateParamsNonStreaming['response_format'] {
  if (responseFormat === 'json_object') {
    return { type: 'json_object' };
  }

  return {
    type: 'json_schema',
    json_schema: {
      name: 'knowledge_graph',
      strict: true,
      schema: applyOutputLimits(GRAPH_RESPONSE_SCHEMA, schema),
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

/**
 * Create an OpenAI client configured for the given provider.
 */
function createOpenAIClient(provider: ProviderConfig): OpenAI {
  const baseURL = getBaseURL(provider);
  const apiKey = getApiKey(provider);

  return new OpenAI({
    baseURL,
    apiKey,
    timeout: REQUEST_TIMEOUT_MS,
  });
}

/**
 * Determine the base URL for the provider.
 */
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
      return undefined; // Use OpenAI default
    case 'anthropic':
      return undefined; // Anthropic uses different SDK, but OpenAI-compatible mode available
    default:
      return provider.baseUrl;
  }
}

/**
 * Determine the API key for the provider.
 */
function getApiKey(provider: ProviderConfig): string {
  if (provider.apiKey) {
    return provider.apiKey;
  }

  switch (provider.type) {
    case 'lmstudio':
    case 'ollama':
      return ''; // Local providers don't need API key
    case 'openai':
      return process.env.OPENAI_API_KEY ?? '';
    case 'anthropic':
      return process.env.ANTHROPIC_API_KEY ?? '';
    default:
      return '';
  }
}
