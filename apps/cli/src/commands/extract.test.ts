import { afterEach, describe, expect, test } from 'bun:test';
import { resolveProvider } from './extract.js';

const ORIGINAL_ENV = {
  GRAPH_EXTRACT_PROVIDER: process.env.GRAPH_EXTRACT_PROVIDER,
  GRAPH_EXTRACT_BASE_URL: process.env.GRAPH_EXTRACT_BASE_URL,
  GRAPH_EXTRACT_MODEL: process.env.GRAPH_EXTRACT_MODEL,
  GRAPH_EXTRACT_API_KEY: process.env.GRAPH_EXTRACT_API_KEY,
};

afterEach(() => {
  process.env.GRAPH_EXTRACT_PROVIDER = ORIGINAL_ENV.GRAPH_EXTRACT_PROVIDER;
  process.env.GRAPH_EXTRACT_BASE_URL = ORIGINAL_ENV.GRAPH_EXTRACT_BASE_URL;
  process.env.GRAPH_EXTRACT_MODEL = ORIGINAL_ENV.GRAPH_EXTRACT_MODEL;
  process.env.GRAPH_EXTRACT_API_KEY = ORIGINAL_ENV.GRAPH_EXTRACT_API_KEY;
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
});
