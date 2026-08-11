import type { CatalogEntity, ExtractedEntity, RelationshipSnippet } from './staged-types.js';

const DEFAULT_MAX_SNIPPETS = 16;
const DEFAULT_MAX_TOTAL_CHARS = 5000;
const DEFAULT_MAX_SNIPPET_CHARS = 420;

interface CandidateSnippet {
  text: string;
  position: number;
  entityIds: string[];
  score: number;
}

export function buildEntityCatalog(entities: ExtractedEntity[]): CatalogEntity[] {
  const catalog: CatalogEntity[] = [];
  const seenKeys = new Set<string>();

  for (const entity of entities) {
    const key = normalizeEntityKey(entity.text);
    if (!key || seenKeys.has(key)) {
      continue;
    }

    seenKeys.add(key);
    catalog.push({
      id: entity.id ?? `E${catalog.length + 1}`,
      text: entity.text.trim(),
      type: normalizeEntityType(entity.type),
      mention: normalizeOptionalText(entity.mention),
    });
  }

  return catalog;
}

export function buildEvidenceSnippets(
  text: string,
  entities: CatalogEntity[],
  options?: {
    maxSnippets?: number;
    maxTotalChars?: number;
    maxSnippetChars?: number;
  },
): RelationshipSnippet[] {
  if (!text.trim() || entities.length === 0) {
    return [];
  }

  const maxSnippets = options?.maxSnippets ?? DEFAULT_MAX_SNIPPETS;
  const maxTotalChars = options?.maxTotalChars ?? DEFAULT_MAX_TOTAL_CHARS;
  const maxSnippetChars = options?.maxSnippetChars ?? DEFAULT_MAX_SNIPPET_CHARS;

  const entityNeedles = entities.map((entity) => ({
    id: entity.id,
    needles: buildEntityNeedles(entity),
  }));

  const candidates = splitIntoSnippetCandidates(text, maxSnippetChars)
    .map((candidate, index) => {
      const matchedEntityIds = matchSnippetEntities(candidate, entityNeedles);
      return {
        text: candidate,
        position: index,
        entityIds: matchedEntityIds,
        score: scoreSnippet(candidate, matchedEntityIds.length, index),
      } satisfies CandidateSnippet;
    })
    .filter((candidate) => candidate.entityIds.length > 0);

  const selected = selectTopSnippets(candidates, maxSnippets, maxTotalChars);

  return selected.map((snippet, index) => ({
    id: `S${index + 1}`,
    text: snippet.text,
    entityIds: snippet.entityIds,
  }));
}

function splitIntoSnippetCandidates(text: string, maxSnippetChars: number): string[] {
  const blocks = text
    .replace(/\r\n/g, '\n')
    .split(/\n\s*\n+/)
    .map((block) => normalizeSourceText(block))
    .filter(Boolean);

  const snippets: string[] = [];
  // Last sentence of the previous block, so a paragraph-initial anaphoric
  // sentence ("Launched atop a Saturn V rocket...") can still reach its
  // antecedent across the paragraph boundary.
  let previousBlockTail: string | undefined;

  for (const block of blocks) {
    const sentences = splitIntoSentences(block);

    if (block.length <= maxSnippetChars) {
      const snippet = prependAntecedent(block, previousBlockTail, maxSnippetChars);
      snippets.push(snippet);
      previousBlockTail = sentences[sentences.length - 1] ?? previousBlockTail;
      continue;
    }

    if (sentences.length <= 1) {
      snippets.push(block.slice(0, maxSnippetChars));
      previousBlockTail = sentences[0] ?? previousBlockTail;
      continue;
    }

    for (let i = 0; i < sentences.length; i++) {
      const current = sentences[i];
      if (!current) {
        continue;
      }

      let snippet = prependAntecedent(current, sentences[i - 1] ?? previousBlockTail, maxSnippetChars);

      const next = sentences[i + 1];
      if (next && snippet.length < Math.floor(maxSnippetChars * 0.6)) {
        const combined = `${snippet} ${next}`.trim();
        if (combined.length <= maxSnippetChars) {
          snippet = combined;
        }
      }

      snippets.push(snippet.slice(0, maxSnippetChars));
    }

    previousBlockTail = sentences[sentences.length - 1] ?? previousBlockTail;
  }

  return dedupeStrings(snippets);
}

const ANAPHORIC_OPENERS =
  /^(?:"[^"]{0,80}"\s+)?(?:They|He|She|It|Both|Together|These|Those|This|That|Their|His|Her|Its|The (?:two|three|four|pair|crew|group|team|both))\b/;
// A sentence-initial past participle followed by a lowercase word reads as an
// elided subject ("Launched atop...", "Founded in..."). Proper names ending in
// -ed followed by a capitalized word do not match.
const ELIDED_SUBJECT_OPENER = /^[A-Z][a-z]+ed\s+[a-z]/;

function startsWithAnaphoricSubject(sentence: string): boolean {
  return ANAPHORIC_OPENERS.test(sentence) || ELIDED_SUBJECT_OPENER.test(sentence);
}

/**
 * Anaphora window: a sentence whose subject is a pronoun ("Together they
 * spent...") or elided ("Launched atop a Saturn V rocket...") carries
 * relations whose named antecedent lives in the previous sentence. Prepend it
 * so those entities are present and citable in the snippet; when both don't
 * fit, keep the antecedent and truncate the current sentence's tail — the
 * subject linkage is worth more than the tail of a long sentence.
 */
function prependAntecedent(
  current: string,
  previous: string | undefined,
  maxSnippetChars: number,
): string {
  if (!previous || !startsWithAnaphoricSubject(current)) {
    return current;
  }

  // Leave at least ~40% of the budget for the sentence itself.
  if (previous.length > Math.floor(maxSnippetChars * 0.6)) {
    return current;
  }

  return `${previous} ${current}`.trim().slice(0, maxSnippetChars);
}

function splitIntoSentences(block: string): string[] {
  return block
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"“])/)
    .map((sentence) => normalizeSourceText(sentence))
    .filter(Boolean);
}

function selectTopSnippets(
  candidates: CandidateSnippet[],
  maxSnippets: number,
  maxTotalChars: number,
): CandidateSnippet[] {
  const preferred = candidates.filter((candidate) => candidate.entityIds.length >= 2);
  const pool = preferred.length > 0 ? preferred : candidates;

  const ranked = [...pool].sort(
    (left, right) => right.score - left.score || left.position - right.position,
  );
  const selected: CandidateSnippet[] = [];
  let totalChars = 0;

  for (const candidate of ranked) {
    if (selected.length >= maxSnippets) {
      break;
    }

    if (totalChars + candidate.text.length > maxTotalChars) {
      continue;
    }

    selected.push(candidate);
    totalChars += candidate.text.length;
  }

  return selected.sort((left, right) => left.position - right.position);
}

function matchSnippetEntities(
  snippet: string,
  entityNeedles: Array<{ id: string; needles: string[] }>,
): string[] {
  const normalizedSnippet = normalizeNeedle(snippet);
  const paddedSnippet = ` ${normalizedSnippet} `;

  return entityNeedles
    .filter((entity) => entity.needles.some((needle) => paddedSnippet.includes(` ${needle} `)))
    .map((entity) => entity.id);
}

function buildEntityNeedles(entity: CatalogEntity): string[] {
  const needles = new Set<string>();

  addNeedle(needles, entity.text);
  addNeedle(needles, entity.mention);

  return [...needles];
}

function addNeedle(target: Set<string>, value: string | undefined) {
  const normalized = normalizeNeedle(value);
  if (normalized) {
    target.add(normalized);
  }
}

function scoreSnippet(text: string, entityCount: number, position: number): number {
  const densityBonus = entityCount * 100;
  const brevityBonus = Math.max(0, 120 - Math.abs(text.length - 220)) / 10;
  const earlyBonus = Math.max(0, 40 - position);

  return densityBonus + brevityBonus + earlyBonus;
}

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const value of values) {
    if (!value || seen.has(value)) {
      continue;
    }

    seen.add(value);
    deduped.push(value);
  }

  return deduped;
}

function normalizeSourceText(value: string): string {
  return value
    .replace(/(\w)-\s+(\w)/g, '$1$2')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeNeedle(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value
    .toLowerCase()
    .replace(/(\w)-\s+(\w)/g, '$1$2')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');

  return normalized || undefined;
}

function normalizeEntityKey(value: string): string | undefined {
  const normalized = normalizeNeedle(value);
  return normalized || undefined;
}

function normalizeEntityType(value: string): string {
  const normalized = value.trim();
  return normalized || 'other';
}

function normalizeOptionalText(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}
