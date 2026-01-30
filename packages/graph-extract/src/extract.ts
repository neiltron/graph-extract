import { Extractor } from './extractor.js';
import type { ExtractionResult, ExtractorConfig } from './types.js';

/**
 * Extract entities and relationships from text.
 * This is a convenience function for one-off extractions.
 * For multiple extractions, use createExtractor() to reuse the connection.
 */
export async function extract(text: string, config: ExtractorConfig): Promise<ExtractionResult> {
  const extractor = new Extractor(config);
  return extractor.extract(text);
}

/**
 * Create a reusable extractor instance.
 * Use this when performing multiple extractions to reuse the LLM connection.
 */
export function createExtractor(config: ExtractorConfig): Extractor {
  return new Extractor(config);
}
