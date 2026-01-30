import OpenAI from 'openai';
import { GraphExtractError, ParseError, ProviderError } from './errors.js';
import { parseGraph } from './parse.js';
import { buildPrompt } from './prompt.js';
import { resolveSchema } from './schema.js';
import type {
  ExtractionOptions,
  ExtractionResult,
  ExtractorConfig,
  ProviderConfig,
} from './types.js';
import { validate } from './validate.js';

const DEFAULT_TEMPERATURE = 0;
const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_MAX_RETRIES = 2;
const REQUEST_TIMEOUT_MS = 60000;

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

    // Try extraction with retries
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await this.callLLM(prompt, temperature, maxTokens);
        raw = response.content;

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
          lastError = e;
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
    temperature: number,
    maxTokens: number,
  ): Promise<{ content: string; usage?: { inputTokens: number; outputTokens: number } }> {
    try {
      const response = await this.client.chat.completions.create({
        model: this.config.provider.model,
        messages: [{ role: 'user', content: prompt }],
        temperature,
        max_tokens: maxTokens,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new ProviderError('Empty response from LLM');
      }

      return {
        content,
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
      return 'not-needed'; // Local providers don't need API key
    case 'openai':
      return process.env.OPENAI_API_KEY ?? '';
    case 'anthropic':
      return process.env.ANTHROPIC_API_KEY ?? '';
    default:
      return '';
  }
}
