import { describe, expect, test } from 'bun:test';
import { buildEvidenceSnippets } from '../src/staged-context.js';

describe('anaphora-aware snippet windows', () => {
  const entities = [
    { id: 'E1', text: 'Neil Armstrong', type: 'person' },
    { id: 'E2', text: 'Richard Nixon', type: 'person' },
    { id: 'E3', text: 'Apollo 11', type: 'event' },
    { id: 'E4', text: 'Saturn V', type: 'product' },
  ];

  test('prepends the antecedent sentence for pronoun-initial sentences', () => {
    // Force sentence-level splitting with a long block; the Nixon sentence's
    // subject is the pronoun "they", whose antecedent is the previous sentence.
    const text = [
      'Neil Armstrong and the crew of Apollo 11 walked on the lunar surface for hours while mission control watched from Houston and the world followed along on live television broadcasts everywhere.',
      'Together they spent time planting a flag and speaking by telephone with President Richard Nixon.',
    ].join(' ');

    const snippets = buildEvidenceSnippets(text, entities, { maxSnippetChars: 420 });
    const nixonSnippet = snippets.find((s) => s.text.includes('Richard Nixon'));

    expect(nixonSnippet).toBeDefined();
    expect(nixonSnippet?.text).toContain('Neil Armstrong');
    expect(nixonSnippet?.entityIds).toContain('E1');
    expect(nixonSnippet?.entityIds).toContain('E2');
  });

  test('prepends the antecedent for elided-subject sentences', () => {
    const text = [
      'Apollo 11 was the American spaceflight that first landed humans on the Moon after a fierce decade-long competition between two superpowers that consumed enormous budgets and attention.',
      'Launched atop a Saturn V rocket from the Kennedy Space Center, the spacecraft carried a crew of three astronauts on the journey.',
    ].join(' ');

    const snippets = buildEvidenceSnippets(text, entities, { maxSnippetChars: 420 });
    const launchSnippet = snippets.find((s) => s.text.includes('Saturn V'));

    expect(launchSnippet).toBeDefined();
    expect(launchSnippet?.text).toContain('Apollo 11');
    expect(launchSnippet?.entityIds).toContain('E3');
    expect(launchSnippet?.entityIds).toContain('E4');
  });
});
