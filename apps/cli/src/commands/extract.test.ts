import { afterEach, describe, expect, test } from 'bun:test';
import { resolveProvider } from './extract.js';

const ORIGINAL_ENV = {
  GRAPH_EXTRACT_PROVIDER: process.env.GRAPH_EXTRACT_PROVIDER,
  GRAPH_EXTRACT_BASE_URL: process.env.GRAPH_EXTRACT_BASE_URL,
  GRAPH_EXTRACT_MODEL: process.env.GRAPH_EXTRACT_MODEL,
  GRAPH_EXTRACT_API_KEY: process.env.GRAPH_EXTRACT_API_KEY,
  GRAPH_EXTRACT_STOP: process.env.GRAPH_EXTRACT_STOP,
  GRAPH_EXTRACT_RESPONSE_FORMAT: process.env.GRAPH_EXTRACT_RESPONSE_FORMAT,
};

afterEach(() => {
  process.env.GRAPH_EXTRACT_PROVIDER = ORIGINAL_ENV.GRAPH_EXTRACT_PROVIDER;
  process.env.GRAPH_EXTRACT_BASE_URL = ORIGINAL_ENV.GRAPH_EXTRACT_BASE_URL;
  process.env.GRAPH_EXTRACT_MODEL = ORIGINAL_ENV.GRAPH_EXTRACT_MODEL;
  process.env.GRAPH_EXTRACT_API_KEY = ORIGINAL_ENV.GRAPH_EXTRACT_API_KEY;
  process.env.GRAPH_EXTRACT_STOP = ORIGINAL_ENV.GRAPH_EXTRACT_STOP;
  process.env.GRAPH_EXTRACT_RESPONSE_FORMAT = ORIGINAL_ENV.GRAPH_EXTRACT_RESPONSE_FORMAT;
});

describe('resolveProvider', () => {
  test('uses explicit apiKey from CLI args', () => {
    const provider = resolveProvider({
      provider: 'lmstudio',
      baseUrl: 'http://localhost:1234/v1',
      model: 'local-model',
      apiKey: 'local-token',
    });

    expect(provider).toEqual({
      type: 'lmstudio',
      baseUrl: 'http://localhost:1234/v1',
      model: 'local-model',
      apiKey: 'local-token',
      stop: undefined,
      responseFormat: undefined,
    });
  });

  test('uses GRAPH_EXTRACT_API_KEY when CLI arg is missing', () => {
    process.env.GRAPH_EXTRACT_PROVIDER = 'lmstudio';
    process.env.GRAPH_EXTRACT_BASE_URL = 'http://localhost:1234/v1';
    process.env.GRAPH_EXTRACT_MODEL = 'local-model';
    process.env.GRAPH_EXTRACT_API_KEY = 'env-token';

    const provider = resolveProvider({});

    expect(provider).toEqual({
      type: 'lmstudio',
      baseUrl: 'http://localhost:1234/v1',
      model: 'local-model',
      apiKey: 'env-token',
      stop: undefined,
      responseFormat: undefined,
    });
  });

  test('prefers CLI apiKey over GRAPH_EXTRACT_API_KEY', () => {
    process.env.GRAPH_EXTRACT_API_KEY = 'env-token';

    const provider = resolveProvider({
      provider: 'lmstudio',
      model: 'local-model',
      apiKey: 'cli-token',
    });

    expect(provider.apiKey).toBe('cli-token');
  });

  test('uses stop sequences from CLI args', () => {
    const provider = resolveProvider({
      provider: 'lmstudio',
      model: 'local-model',
      stop: ['<|im_end|>', '<|endoftext|>'],
    });

    expect(provider.stop).toEqual(['<|im_end|>', '<|endoftext|>']);
  });

  test('uses GRAPH_EXTRACT_STOP when CLI arg is missing', () => {
    process.env.GRAPH_EXTRACT_STOP = '<|im_end|>, <|endoftext|>';

    const provider = resolveProvider({
      provider: 'lmstudio',
      model: 'local-model',
    });

    expect(provider.stop).toEqual(['<|im_end|>', '<|endoftext|>']);
  });

  test('uses response format from CLI args', () => {
    const provider = resolveProvider({
      provider: 'lmstudio',
      model: 'local-model',
      responseFormat: 'json_schema',
    });

    expect(provider.responseFormat).toBe('json_schema');
  });

  test('uses GRAPH_EXTRACT_RESPONSE_FORMAT when CLI arg is missing', () => {
    process.env.GRAPH_EXTRACT_RESPONSE_FORMAT = 'json_schema';

    const provider = resolveProvider({
      provider: 'lmstudio',
      model: 'local-model',
    });

    expect(provider.responseFormat).toBe('json_schema');
  });

  test('throws for unsupported response format', () => {
    expect(() => resolveProvider({ responseFormat: 'yaml' })).toThrow(
      'Unsupported response format: yaml. Supported values: json_object, json_schema',
    );
  });

  test('throws for more than 4 stop sequences', () => {
    expect(() =>
      resolveProvider({
        stop: ['a', 'b', 'c', 'd', 'e'],
      }),
    ).toThrow('stop supports up to 4 sequences');
  });
});
