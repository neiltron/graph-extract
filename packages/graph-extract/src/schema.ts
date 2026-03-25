import { DEFAULT_ENTITY_TYPES, DEFAULT_RELATION_TYPES, type Schema } from './types.js';

/**
 * Merge a partial schema with defaults, returning a complete schema.
 */
export function resolveSchema(
  schema?: Schema,
): Required<Pick<Schema, 'entityTypes' | 'relationTypes'>> & Schema {
  return {
    entityTypes: schema?.entityTypes ?? [...DEFAULT_ENTITY_TYPES],
    relationTypes: schema?.relationTypes ?? [...DEFAULT_RELATION_TYPES],
    instructions: schema?.instructions,
    maxNodes: schema?.maxNodes,
    maxEdges: schema?.maxEdges,
  };
}
