import type {
  Edge,
  Graph,
  RelationConstraint,
  ValidationError,
  ValidationResult,
  ValidationWarning,
} from './types.js';

/** The concrete canonical entity types; 'other' and custom types always pass. */
const CHECKED_ENTITY_TYPES = new Set([
  'person',
  'organization',
  'location',
  'date',
  'product',
  'event',
  'concept',
]);

function violatesTypes(allowed: string[] | undefined, entityType: string): boolean {
  if (!allowed || !CHECKED_ENTITY_TYPES.has(entityType)) {
    return false;
  }
  return !allowed.includes(entityType);
}

/**
 * Enforce per-relation entity-type constraints deterministically.
 * A violating edge is flipped when the reversed direction satisfies the
 * constraint (direction repair), otherwise dropped. Unconstrained relations
 * and non-canonical entity types are never touched.
 */
export function enforceRelationConstraints(
  graph: Graph,
  constraints: Record<string, RelationConstraint>,
): { graph: Graph; warnings: ValidationWarning[] } {
  const warnings: ValidationWarning[] = [];
  const typeById = new Map(graph.nodes.map((node) => [node.id, node.type]));
  const labelById = new Map(graph.nodes.map((node) => [node.id, node.label]));
  const edges: Edge[] = [];

  for (const edge of graph.edges) {
    const constraint = constraints[edge.type];
    const sourceType = typeById.get(edge.source) ?? 'other';
    const targetType = typeById.get(edge.target) ?? 'other';

    if (!constraint) {
      edges.push(edge);
      continue;
    }

    const sourceViolates = violatesTypes(constraint.sourceTypes, sourceType);
    const targetViolates = violatesTypes(constraint.targetTypes, targetType);

    if (!sourceViolates && !targetViolates) {
      edges.push(edge);
      continue;
    }

    // Flip only when BOTH ends violate and the swap satisfies both — the
    // signature of a subject/object swap. A single violating end means the
    // pairing itself is suspect ("Congress created JFK"), and flipping would
    // just launder a wrong edge into a type-plausible one; drop it instead.
    const flippedSatisfies =
      sourceViolates &&
      targetViolates &&
      !violatesTypes(constraint.sourceTypes, targetType) &&
      !violatesTypes(constraint.targetTypes, sourceType);

    if (flippedSatisfies) {
      edges.push({ ...edge, source: edge.target, target: edge.source });
      warnings.push({
        type: 'edge_direction_repaired',
        message: `Flipped edge ${edge.id}: "${labelById.get(edge.source)}" ${edge.type} "${labelById.get(edge.target)}" violated type constraints in that direction`,
        edgeId: edge.id,
        details: { relation: edge.type, sourceType, targetType },
      });
    } else {
      warnings.push({
        type: 'constraint_violation',
        message: `Removed edge ${edge.id}: ${edge.type} does not allow ${sourceType} → ${targetType} ("${labelById.get(edge.source)}" → "${labelById.get(edge.target)}")`,
        edgeId: edge.id,
        details: { relation: edge.type, sourceType, targetType },
      });
    }
  }

  if (warnings.length === 0) {
    return { graph, warnings };
  }

  return { graph: { nodes: graph.nodes, edges }, warnings };
}

/**
 * Validate a graph structure and return a cleaned version.
 * - Checks that all nodes have IDs
 * - Checks for duplicate IDs
 * - Checks that all edge sources/targets reference valid nodes
 * - Removes invalid edges (those referencing non-existent nodes)
 */
export function validate(graph: Graph): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  const nodeIds = new Set<string>();
  const edgeIds = new Set<string>();

  // Handle missing or invalid nodes array
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph.edges) ? graph.edges : [];

  // Check nodes
  for (const node of nodes) {
    if (!node.id) {
      errors.push({
        type: 'missing_node_id',
        message: `Node missing id: ${JSON.stringify(node)}`,
      });
      continue;
    }
    if (nodeIds.has(node.id)) {
      errors.push({
        type: 'duplicate_id',
        message: `Duplicate node id: ${node.id}`,
      });
    }
    nodeIds.add(node.id);
  }

  // Check edges and filter invalid ones
  const validEdges: Edge[] = [];

  for (const edge of edges) {
    if (!edge.id) {
      errors.push({
        type: 'missing_edge_id',
        message: `Edge missing id: ${JSON.stringify(edge)}`,
      });
      continue;
    }

    if (edgeIds.has(edge.id)) {
      errors.push({
        type: 'duplicate_id',
        message: `Duplicate edge id: ${edge.id}`,
      });
    }
    edgeIds.add(edge.id);

    let isValid = true;

    if (!nodeIds.has(edge.source)) {
      warnings.push({
        type: 'invalid_edge_source',
        message: `Edge ${edge.id} references non-existent source: ${edge.source}`,
        edgeId: edge.id,
        details: { source: edge.source },
      });
      isValid = false;
    }

    if (!nodeIds.has(edge.target)) {
      warnings.push({
        type: 'invalid_edge_target',
        message: `Edge ${edge.id} references non-existent target: ${edge.target}`,
        edgeId: edge.id,
        details: { target: edge.target },
      });
      isValid = false;
    }

    if (isValid) {
      validEdges.push(edge);
    } else {
      warnings.push({
        type: 'removed_edge',
        message: `Removed invalid edge: ${edge.id}`,
        edgeId: edge.id,
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    graph: {
      nodes: nodes.filter((n) => n.id), // Remove nodes without IDs
      edges: validEdges,
    },
  };
}

/**
 * Report nodes with no edges, and optionally remove them.
 * Isolated nodes are usually a recall artifact (e.g. a relation carried by a
 * pronoun that snippet grounding could not cite) — surface them so callers can
 * decide, and prune deterministically when asked.
 */
export function compactGraph(
  graph: Graph,
  options: { pruneIsolatedNodes?: boolean },
): { graph: Graph; warnings: ValidationWarning[] } {
  const connected = new Set<string>();
  for (const edge of graph.edges) {
    connected.add(edge.source);
    connected.add(edge.target);
  }

  const isolated = graph.nodes.filter((node) => !connected.has(node.id));
  if (isolated.length === 0) {
    return { graph, warnings: [] };
  }

  const labels = isolated.map((node) => node.label);

  if (!options.pruneIsolatedNodes) {
    return {
      graph,
      warnings: [
        {
          type: 'isolated_nodes',
          message: `${isolated.length} node(s) have no edges: ${labels.join(', ')}`,
          details: { labels },
        },
      ],
    };
  }

  return {
    graph: {
      nodes: graph.nodes.filter((node) => connected.has(node.id)),
      edges: graph.edges,
    },
    warnings: [
      {
        type: 'isolated_nodes',
        message: `Pruned ${isolated.length} node(s) with no edges: ${labels.join(', ')}`,
        details: { labels, pruned: true },
      },
    ],
  };
}

/**
 * Deterministically trim a graph to the schema's maxNodes/maxEdges limits.
 * Nodes are ranked by degree (edge count), preserving original order on ties
 * since models tend to list salient entities first. Edges referencing trimmed
 * nodes are dropped, then remaining edges are kept in original order up to the
 * limit. Returns the trimmed graph plus a single summary warning when anything
 * was removed.
 */
export function enforceGraphLimits(
  graph: Graph,
  limits: { maxNodes?: number; maxEdges?: number },
): { graph: Graph; warnings: ValidationWarning[] } {
  const { maxNodes, maxEdges } = limits;
  const overNodes = maxNodes !== undefined && graph.nodes.length > maxNodes;
  const overEdges = maxEdges !== undefined && graph.edges.length > maxEdges;

  if (!overNodes && !overEdges) {
    return { graph, warnings: [] };
  }

  let nodes = graph.nodes;
  let edges = graph.edges;

  if (overNodes && maxNodes !== undefined) {
    const degree = new Map<string, number>();
    for (const edge of edges) {
      degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
      degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
    }

    const ranked = nodes
      .map((node, index) => ({ node, index, degree: degree.get(node.id) ?? 0 }))
      .sort((a, b) => b.degree - a.degree || a.index - b.index)
      .slice(0, maxNodes)
      .sort((a, b) => a.index - b.index);

    nodes = ranked.map((entry) => entry.node);
    const keptIds = new Set(nodes.map((node) => node.id));
    edges = edges.filter((edge) => keptIds.has(edge.source) && keptIds.has(edge.target));
  }

  if (maxEdges !== undefined && edges.length > maxEdges) {
    edges = edges.slice(0, maxEdges);
  }

  const warnings: ValidationWarning[] = [
    {
      type: 'graph_truncated',
      message: `Trimmed graph from ${graph.nodes.length} to ${nodes.length} nodes and ${graph.edges.length} to ${edges.length} edges to satisfy limits`,
      details: {
        maxNodes,
        maxEdges,
        originalNodeCount: graph.nodes.length,
        originalEdgeCount: graph.edges.length,
      },
    },
  ];

  return { graph: { nodes, edges }, warnings };
}
