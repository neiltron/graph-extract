import type { Edge, Graph, ValidationError, ValidationResult, ValidationWarning } from './types.js';

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
