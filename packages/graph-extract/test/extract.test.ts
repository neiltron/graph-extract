import { describe, expect, mock, test } from 'bun:test';
import { GraphExtractError, ParseError } from '../src/errors.js';
import { Extractor, createExtractor, extract } from '../src/index.js';

// Mock OpenAI client responses
const mockValidResponse = {
  choices: [
    {
      finish_reason: 'stop',
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

  test('does not retry truncated stop responses', async () => {
    let calls = 0;

    const extractor = new Extractor({
      provider: { type: 'lmstudio', model: 'test-model' },
    });

    (extractor as unknown as { client: unknown }).client = {
      chat: {
        completions: {
          create: mock(async () => {
            calls++;
            return {
              choices: [
                {
                  finish_reason: 'stop',
                  message: {
                    content:
                      '{"nodes":[{"id":"node_1","label":"Lorem Ipsum","type":"concept"}],"edges":[{"id":"edge_1","source":"node_1","target":"node_2","type":"related_to","label":"rel',
                  },
                },
              ],
              usage: {
                prompt_tokens: 100,
                completion_tokens: 50,
              },
            };
          }),
        },
      },
    };

    await expect(extractor.extract('Alice works at Acme Corp')).rejects.toThrow(
      'finish_reason: stop',
    );
    expect(calls).toBe(1);
  });

  test('passes json_schema response_format when configured', async () => {
    let request: unknown;

    const extractor = new Extractor({
      provider: { type: 'lmstudio', model: 'test-model', responseFormat: 'json_schema' },
      schema: {
        maxNodes: 5,
        maxEdges: 7,
      },
    });

    (extractor as unknown as { client: unknown }).client = {
      chat: {
        completions: {
          create: mock(async (params: unknown) => {
            request = params;
            return mockValidResponse;
          }),
        },
      },
    };

    await extractor.extract('Alice works at Acme Corp');

    expect(request).toMatchObject({
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'knowledge_graph',
          strict: true,
          schema: {
            properties: {
              nodes: {
                maxItems: 5,
              },
              edges: {
                maxItems: 7,
              },
            },
          },
        },
      },
    });
  });

  test('passes stop sequences when configured', async () => {
    let request: unknown;

    const extractor = new Extractor({
      provider: {
        type: 'lmstudio',
        model: 'test-model',
        stop: ['<|im_end|>', '<|endoftext|>'],
      },
    });

    (extractor as unknown as { client: unknown }).client = {
      chat: {
        completions: {
          create: mock(async (params: unknown) => {
            request = params;
            return mockValidResponse;
          }),
        },
      },
    };

    await extractor.extract('Alice works at Acme Corp');

    expect(request).toMatchObject({
      stop: ['<|im_end|>', '<|endoftext|>'],
    });
  });

  test('falls back to reasoning_content when content is empty', async () => {
    const extractor = new Extractor({
      provider: {
        type: 'lmstudio',
        model: 'test-model',
      },
    });

    (extractor as unknown as { client: unknown }).client = {
      chat: {
        completions: {
          create: mock(async () => ({
            choices: [
              {
                finish_reason: 'stop',
                message: {
                  content: null,
                  reasoning_content: JSON.stringify({
                    nodes: [{ id: 'node_1', label: 'Alice', type: 'person' }],
                    edges: [],
                  }),
                },
              },
            ],
            usage: {
              prompt_tokens: 100,
              completion_tokens: 50,
            },
          })),
        },
      },
    };

    const result = await extractor.extract('Alice works at Acme Corp');

    expect(result.graph.nodes).toHaveLength(1);
    expect(result.graph.nodes[0]?.label).toBe('Alice');
  });

  test('does not pass response_format by default', async () => {
    let request: unknown;

    const extractor = new Extractor({
      provider: { type: 'lmstudio', model: 'test-model' },
    });

    (extractor as unknown as { client: unknown }).client = {
      chat: {
        completions: {
          create: mock(async (params: unknown) => {
            request = params;
            return mockValidResponse;
          }),
        },
      },
    };

    await extractor.extract('Alice works at Acme Corp');

    expect(request).not.toMatchObject({
      response_format: { type: 'json_object' },
    });
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
