// Main API
export { extract, createExtractor } from './extract.js';
export { Extractor } from './extractor.js';
export { validate } from './validate.js';

// Types
export type {
  Node,
  Edge,
  Graph,
  EntityType,
  RelationType,
  ExtractionMode,
  ExtractionProgressStage,
  ExtractionProgressEvent,
  Schema,
  ExtractorConfig,
  ProviderConfig,
  ExtractionOptions,
  ExtractionDebugStage,
  ExtractionResult,
  ValidationResult,
  ValidationError,
  ValidationWarning,
} from './types.js';
export type {
  ExtractedEntity,
  CatalogEntity,
  RelationTypeDefinition,
  RelationshipSnippet,
  ExtractedRelationship,
  EntityExtraction,
  RelationSchemaExtraction,
  RelationshipExtraction,
} from './staged-types.js';

// Constants
export { DEFAULT_ENTITY_TYPES, DEFAULT_RELATION_TYPES } from './types.js';

// Errors
export { GraphExtractError, ParseError, ProviderError } from './errors.js';

// Utilities
export { buildPrompt } from './prompt.js';
export {
  buildEntityPrompt,
  buildRelationSchemaPrompt,
  buildRelationshipPrompt,
} from './staged-prompt.js';
export { parseGraph, parseJsonObject } from './parse.js';
export {
  parseEntityExtraction,
  parseRelationSchemaExtraction,
  parseRelationshipExtraction,
} from './staged-parse.js';
export { compileGraphFromStages } from './staged-compile.js';
export { buildEntityCatalog, buildEvidenceSnippets } from './staged-context.js';
export { resolveSchema } from './schema.js';
export { toCanvas } from './canvas.js';
export type {
  CanvasDocument,
  CanvasEdge,
  CanvasExportOptions,
  CanvasSide,
  CanvasTextNode,
} from './canvas.js';
