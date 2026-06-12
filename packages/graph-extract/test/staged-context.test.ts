import { describe, expect, test } from 'bun:test';
import { buildEntityCatalog, buildEvidenceSnippets } from '../src/staged-context.js';

describe('staged context helpers', () => {
  test('buildEntityCatalog deduplicates entities and assigns stable ids', () => {
    const catalog = buildEntityCatalog([
      { text: 'Alice', type: 'person', mention: 'Alice' },
      { text: ' alice ', type: 'person', mention: 'alice' },
      { text: 'Acme Corp', type: 'organization', mention: 'Acme' },
    ]);

    expect(catalog).toEqual([
      { id: 'E1', text: 'Alice', type: 'person', mention: 'Alice' },
      { id: 'E2', text: 'Acme Corp', type: 'organization', mention: 'Acme' },
    ]);
  });

  test('buildEvidenceSnippets selects snippets with matched entity ids', () => {
    const snippets = buildEvidenceSnippets(
      'Alice works at Acme Corp.\n\nAlice met Bob for coffee.\n\nAcme Corp acquired Beta Labs.',
      [
        { id: 'E1', text: 'Alice', type: 'person' },
        { id: 'E2', text: 'Acme Corp', type: 'organization' },
        { id: 'E3', text: 'Beta Labs', type: 'organization' },
      ],
      { maxSnippets: 4, maxTotalChars: 1000 },
    );

    expect(snippets).toEqual([
      {
        id: 'S1',
        text: 'Alice works at Acme Corp.',
        entityIds: ['E1', 'E2'],
      },
      {
        id: 'S2',
        text: 'Acme Corp acquired Beta Labs.',
        entityIds: ['E2', 'E3'],
      },
    ]);
  });
});
