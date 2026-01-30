import { describe, expect, test } from 'bun:test';
import { buildPrompt } from '../src/prompt.js';

describe('buildPrompt', () => {
  test('builds prompt with default schema', () => {
    const text = 'Alice works at Acme Corp.';
    const prompt = buildPrompt(text, {});

    expect(prompt).toContain('TEXT:\nAlice works at Acme Corp.');
    expect(prompt).toContain('ENTITY TYPES: person');
    expect(prompt).toContain('RELATIONSHIP TYPES: works_for');
    expect(prompt).toContain('Output ONLY valid JSON');
    expect(prompt).not.toContain('ADDITIONAL INSTRUCTIONS');
  });

  test('builds prompt with custom entity types', () => {
    const text = 'Test text';
    const prompt = buildPrompt(text, {
      entityTypes: ['person', 'company', 'product'],
    });

    expect(prompt).toContain('ENTITY TYPES: person, company, product');
  });

  test('builds prompt with custom relation types', () => {
    const text = 'Test text';
    const prompt = buildPrompt(text, {
      relationTypes: ['works_for', 'owns'],
    });

    expect(prompt).toContain('RELATIONSHIP TYPES: works_for, owns');
  });

  test('builds prompt with instructions', () => {
    const text = 'Test text';
    const prompt = buildPrompt(text, {
      instructions: 'Focus on employment relationships only.',
    });

    expect(prompt).toContain('ADDITIONAL INSTRUCTIONS:\nFocus on employment relationships only.');
  });

  test('builds prompt with complete custom schema', () => {
    const text = 'Steve Jobs founded Apple.';
    const prompt = buildPrompt(text, {
      entityTypes: ['person', 'organization'],
      relationTypes: ['founded', 'works_for'],
      instructions: 'Extract founding relationships.',
    });

    expect(prompt).toContain('TEXT:\nSteve Jobs founded Apple.');
    expect(prompt).toContain('ENTITY TYPES: person, organization');
    expect(prompt).toContain('RELATIONSHIP TYPES: founded, works_for');
    expect(prompt).toContain('ADDITIONAL INSTRUCTIONS:\nExtract founding relationships.');
  });

  test('includes JSON structure example', () => {
    const prompt = buildPrompt('test', {});

    expect(prompt).toContain('"nodes":');
    expect(prompt).toContain('"edges":');
    expect(prompt).toContain('"id": "node_1"');
    expect(prompt).toContain('"source": "node_1"');
  });

  test('includes extraction rules', () => {
    const prompt = buildPrompt('test', {});

    expect(prompt).toContain('no markdown code blocks');
    expect(prompt).toContain('Deduplicate entities');
    expect(prompt).toContain('sequential IDs');
    expect(prompt).toContain('lowercase_with_underscores');
  });
});
