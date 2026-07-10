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

/**
 * Type constraints for the built-in relation types. Only the seven concrete
 * canonical entity types are ever *checked* — 'other' and custom types always
 * pass, keeping enforcement precision-focused and custom-ontology-safe.
 */
export const DEFAULT_RELATION_CONSTRAINTS: Record<string, RelationConstraint> = {
  works_for: { sourceTypes: ['person'], targetTypes: ['organization', 'person'] },
  founded: { sourceTypes: ['person', 'organization'], targetTypes: ['organization', 'location', 'product', 'concept'] },
  acquired: { sourceTypes: ['person', 'organization'], targetTypes: ['organization', 'product', 'location'] },
  located_in: { sourceTypes: ['person', 'organization', 'location', 'product', 'event', 'concept'], targetTypes: ['location'] },
  born_in: { sourceTypes: ['person'], targetTypes: ['location', 'date'] },
  died_in: { sourceTypes: ['person'], targetTypes: ['location', 'date'] },
  married_to: { sourceTypes: ['person'], targetTypes: ['person'] },
  subsidiary_of: { sourceTypes: ['organization'], targetTypes: ['organization'] },
  created: { sourceTypes: ['person', 'organization'], targetTypes: ['product', 'concept', 'organization', 'event', 'location'] },
  member_of: { sourceTypes: ['person', 'organization'], targetTypes: ['organization', 'event', 'concept'] },
  produced_by: { sourceTypes: ['product', 'concept', 'event', 'organization', 'location'], targetTypes: ['person', 'organization'] },
  part_of: { sourceTypes: ['person', 'organization', 'location', 'product', 'event', 'concept'], targetTypes: ['organization', 'location', 'product', 'event', 'concept'] },
  owns: { sourceTypes: ['person', 'organization'], targetTypes: ['product', 'organization', 'location', 'concept'] },
  // related_to is the untyped fallback: deliberately unconstrained.
};

export type ExtractionMode = 'single' | 'staged';
export type ExtractionProgressStage = 'single' | 'entity' | 'relation_schema' | 'relationship';

export type ExtractionProgressEvent =
  | {
      type: 'stage_start' | 'stage_complete';
      mode: ExtractionMode;
      stage: ExtractionProgressStage;
    }
  | {
      type: 'stage_retry';
      mode: ExtractionMode;
      stage: ExtractionProgressStage;
      attempt: number;
      reason: string;
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

  /** Remove nodes with no edges from the final graph (default: false). */
  pruneIsolatedNodes?: boolean;

  /**
   * Per-relation entity-type constraints, merged over the built-in defaults.
   * Edges violating a constraint are flipped when the reversed direction
   * satisfies it, otherwise dropped with a warning.
   */
  relationConstraints?: Record<string, RelationConstraint>;
}

export interface RelationConstraint {
  /** Entity types allowed as the edge source (subject). Omit for any. */
  sourceTypes?: string[];
  /** Entity types allowed as the edge target (object). Omit for any. */
  targetTypes?: string[];
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

  /**
   * Staged mode only: scope of the relationship extraction stage.
   * 'global' (default) sends every evidence snippet in one call;
   * 'snippet' makes one small call per snippet and merges the results,
   * which bounds per-call output and keeps subject/object decisions local
   * to a single sentence.
   */
  relationshipScope?: 'global' | 'snippet';

  /**
   * Per-stage model overrides (e.g. a fine-tuned relationship-stage model
   * alongside a base entity-stage model). Falls back to provider.model.
   */
  stageModels?: Partial<Record<'single' | 'entity' | 'relation_schema' | 'relationship', string>>;

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

  /**
   * OpenAI-compatible response format override.
   * Defaults to 'json_schema' for the lmstudio provider; use 'text' to disable
   * structured output entirely. If the server rejects response_format, the
   * extractor falls back to plain text output and records a warning.
   */
  responseFormat?: 'json_object' | 'json_schema' | 'text';

  /** Per-request timeout in milliseconds (default: 240000). */
  timeoutMs?: number;
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
    | 'unresolved_relationship_target'
    | 'graph_truncated'
    | 'isolated_nodes'
    | 'snippet_relationship_failed'
    | 'constraint_violation'
    | 'edge_direction_repaired'
    | 'response_format_fallback';
  message: string;
  edgeId?: string;
  details?: Record<string, unknown>;
}
