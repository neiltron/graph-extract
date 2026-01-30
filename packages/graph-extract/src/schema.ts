import { DEFAULT_ENTITY_TYPES, DEFAULT_RELATION_TYPES, type Schema } from './types.js';

/**
 * Merge a partial schema with defaults, returning a complete schema.
 */
export function resolveSchema(schema?: Schema): Required<Omit<Schema, 'instructions'>> & Schema {
  return {
    entityTypes: schema?.entityTypes ?? [...DEFAULT_ENTITY_TYPES],
    relationTypes: schema?.relationTypes ?? [...DEFAULT_RELATION_TYPES],
    instructions: schema?.instructions,
  };
}
