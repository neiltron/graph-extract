import { describe, expect, mock, test } from 'bun:test';
import { GraphExtractError, ParseError } from '../src/errors.js';
import { Extractor, createExtractor, extract } from '../src/index.js';

// Mock OpenAI client responses
const mockValidResponse = {
  choices: [
    {
      message: {
        content: JSON.stringify({
          nodes: [
            { id: 'node_1', label: 'Alice', type: 'person' },
            { id: 'node_2', label: 'Acme Corp', type: 'organization' },
          ],
          edges: [
            {
              id: 'edge_1',
              source: 'node_1',
              target: 'node_2',
              type: 'works_for',
              label: 'works for',
            },
          ],
        }),
      },
    },
  ],
  usage: {
    prompt_tokens: 100,
    completion_tokens: 50,
  },
};

describe('Extractor', () => {
  test('throws GraphExtractError for empty input', async () => {
    const extractor = new Extractor({
      provider: { type: 'lmstudio', model: 'test-model' },
    });

    await expect(extractor.extract('')).rejects.toThrow(GraphExtractError);
    await expect(extractor.extract('   ')).rejects.toThrow(GraphExtractError);
  });

  test('throws GraphExtractError with correct message for empty input', async () => {
    const extractor = new Extractor({
      provider: { type: 'lmstudio', model: 'test-model' },
    });

    try {
      await extractor.extract('');
      expect(true).toBe(false); // Should not reach
    } catch (e) {
      expect(e).toBeInstanceOf(GraphExtractError);
      expect((e as GraphExtractError).message).toBe('Input text cannot be empty');
    }
  });
});

describe('createExtractor', () => {
  test('returns an Extractor instance', () => {
    const extractor = createExtractor({
      provider: { type: 'lmstudio', model: 'test-model' },
    });

    expect(extractor).toBeInstanceOf(Extractor);
  });
});

describe('extract function', () => {
  test('throws GraphExtractError for empty input', async () => {
    await expect(
      extract('', {
        provider: { type: 'lmstudio', model: 'test-model' },
      }),
    ).rejects.toThrow(GraphExtractError);
  });
});
