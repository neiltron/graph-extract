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
