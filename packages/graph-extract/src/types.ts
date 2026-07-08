// ============================================================================
// Core Graph Types
// ============================================================================

export interface Node {
  id: string;
  label: string;
  type: EntityType;
  metadata?: Record<string, unknown>;
}

export interface Edge {
  id: string;
  source: string;
  target: string;
  type: string;
  label: string;
  metadata?: Record<string, unknown>;
}

export interface Graph {
  nodes: Node[];
  edges: Edge[];
}

// ============================================================================
// Entity & Relation Types
// ============================================================================

export type EntityType =
  | 'person'
  | 'organization'
  | 'location'
  | 'date'
  | 'product'
  | 'event'
  | 'concept'
  | 'other'
  | (string & {}); // Allow custom types while preserving autocomplete

export type RelationType =
  | 'works_for'
  | 'founded'
  | 'acquired'
  | 'located_in'
  | 'born_in'
  | 'died_in'
  | 'married_to'
  | 'subsidiary_of'
  | 'created'
  | 'member_of'
  | 'produced_by'
  | 'part_of'
  | 'owns'
  | 'related_to'
  | (string & {}); // Allow custom types

export type ExtractionMode = 'single' | 'staged';
export type ExtractionProgressStage = 'single' | 'entity' | 'relation_schema' | 'relationship';

export type ExtractionProgressEvent =
  | {
      type: 'stage_start' | 'stage_complete';
      mode: ExtractionMode;
      stage: ExtractionProgressStage;
    }
  | {
      type: 'compile_start';
      mode: 'staged';
    }
  | {
      type: 'complete';
      mode: ExtractionMode;
      nodeCount: number;
      edgeCount: number;
      warningCount: number;
    };

// ============================================================================
// Schema Types
// ============================================================================

export interface Schema {
  /** Entity types to extract. Uses defaults if not provided. */
  entityTypes?: string[];

  /** Relation types to extract. Uses defaults if not provided. */
  relationTypes?: string[];

  /** Additional instructions to include in the prompt. */
  instructions?: string;

  /** Maximum number of nodes to return. */
  maxNodes?: number;

  /** Maximum number of edges to return. */
  maxEdges?: number;
}

export const DEFAULT_ENTITY_TYPES: EntityType[] = [
  'person',
  'organization',
  'location',
  'date',
  'product',
  'event',
  'concept',
  'other',
];

export const DEFAULT_RELATION_TYPES: RelationType[] = [
  'works_for',
  'founded',
  'acquired',
  'located_in',
  'born_in',
  'died_in',
  'married_to',
  'subsidiary_of',
  'created',
  'member_of',
  'produced_by',
  'part_of',
  'owns',
  'related_to',
];

// ============================================================================
// Extraction Types
// ============================================================================

export interface ExtractorConfig {
  /** Provider configuration */
  provider: ProviderConfig;

  /** Default schema for all extractions */
  schema?: Schema;

  /** Extraction mode (default: single) */
  mode?: ExtractionMode;

  /** Temperature for LLM (default: 0) */
  temperature?: number;

  /** Max tokens for response (default: 16384) */
  maxTokens?: number;

  /** Number of retries on parse failure (default: 2) */
  maxRetries?: number;

  /** Receive progress events as extraction advances. */
  onProgress?: (event: ExtractionProgressEvent) => void;
}

export interface ProviderConfig {
  /** Provider type or base URL for OpenAI-compatible APIs */
  type: 'lmstudio' | 'openai' | 'anthropic' | 'ollama' | string;

  /** Base URL (required for lmstudio, optional for others) */
  baseUrl?: string;

  /** Model identifier */
  model: string;

  /** API key (not needed for local providers like LM Studio) */
  apiKey?: string;

  /** Stop sequences to send to OpenAI-compatible backends. */
  stop?: string[];

  /** OpenAI-compatible response format override. */
  responseFormat?: 'json_object' | 'json_schema';
}

export interface ExtractionOptions {
  /** Override schema for this extraction */
  schema?: Schema;

  /** Override extraction mode for this extraction */
  mode?: ExtractionMode;

  /** Include stage-level debug artifacts in the result */
  includeDebugArtifacts?: boolean;

  /** Override temperature for this extraction */
  temperature?: number;

  /** Receive progress events as extraction advances. */
  onProgress?: (event: ExtractionProgressEvent) => void;
}

export interface ExtractionDebugStage {
  name: 'entity' | 'relation_schema' | 'relationship';
  raw: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

export interface ExtractionResult {
  /** The extracted graph */
  graph: Graph;

  /** Validation warnings (e.g., removed invalid edges) */
  warnings: ValidationWarning[];

  /** Raw LLM response for debugging. In staged mode this is the final stage raw response. */
  raw: string;

  /** Token usage if available. In staged mode this aggregates all stages. */
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };

  /** Optional debug artifacts for staged extraction. */
  debug?: {
    mode: ExtractionMode;
    stages?: ExtractionDebugStage[];
    compiled?: unknown;
  };
}

// ============================================================================
// Validation Types
// ============================================================================

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  /** Cleaned graph with invalid edges removed */
  graph: Graph;
}

export interface ValidationError {
  type: 'missing_node_id' | 'missing_edge_id' | 'duplicate_id' | 'parse_error';
  message: string;
  details?: Record<string, unknown>;
}

export interface ValidationWarning {
  type:
    | 'invalid_edge_source'
    | 'invalid_edge_target'
    | 'removed_edge'
    | 'unresolved_relationship_source'
    | 'unresolved_relationship_target';
  message: string;
  edgeId?: string;
  details?: Record<string, unknown>;
}
