import dagre from '@dagrejs/dagre';
import type { Edge, Graph, Node } from './types.js';

export type CanvasSide = 'top' | 'right' | 'bottom' | 'left';
export type CanvasRankDirection = 'TB' | 'BT' | 'LR' | 'RL';
export type CanvasAlign = 'UL' | 'UR' | 'DL' | 'DR';
export type CanvasRanker = 'network-simplex' | 'tight-tree' | 'longest-path';

export interface CanvasTextNode {
  id: string;
  type: 'text';
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  color?: string;
}

export interface CanvasEdge {
  id: string;
  fromNode: string;
  fromSide: CanvasSide;
  toNode: string;
  toSide: CanvasSide;
  label?: string;
  color?: string;
}

export interface CanvasDocument {
  nodes: CanvasTextNode[];
  edges: CanvasEdge[];
}

export interface CanvasExportOptions {
  padding?: number;
  componentGap?: number;
  rankdir?: CanvasRankDirection;
  align?: CanvasAlign;
  nodesep?: number;
  edgesep?: number;
  ranksep?: number;
  ranker?: CanvasRanker;
  acyclicer?: 'greedy';
}

interface Point {
  x: number;
  y: number;
}

interface MeasuredNode extends Node {
  width: number;
  height: number;
  text: string;
  color: string;
}

interface ComponentLayout {
  anchorId: string;
  area: number;
  width: number;
  height: number;
  positions: Map<string, Point>;
}

const DEFAULT_OPTIONS: Required<CanvasExportOptions> = {
  padding: 120,
  componentGap: 240,
  rankdir: 'LR',
  align: 'UL',
  nodesep: 70,
  edgesep: 40,
  ranksep: 160,
  ranker: 'network-simplex',
  acyclicer: 'greedy',
};

const EDGE_COLOR = '#64748b';

const NODE_COLORS: Record<string, string> = {
  concept: '#15803d',
  date: '#ca8a04',
  event: '#2563eb',
  location: '#0891b2',
  organization: '#0f766e',
  other: '#475569',
  person: '#dc2626',
  product: '#7c3aed',
};

export function toCanvas(graph: Graph, options: CanvasExportOptions = {}): CanvasDocument {
  const resolvedOptions = { ...DEFAULT_OPTIONS, ...options };
  const sanitizedGraph = sanitizeGraph(graph);
  const measuredNodes = sanitizedGraph.nodes.map((node) => ({
    ...node,
    ...measureNode(node),
  }));

  const positionedNodes = packComponents(
    buildComponentLayouts(measuredNodes, sanitizedGraph.edges, resolvedOptions),
    resolvedOptions,
  );

  const canvasNodes = measuredNodes.map((node) => {
    const position = positionedNodes.get(node.id) ?? { x: 0, y: 0 };

    return {
      id: node.id,
      type: 'text' as const,
      x: position.x,
      y: position.y,
      width: node.width,
      height: node.height,
      text: node.text,
      color: node.color,
    };
  });

  const canvasNodeById = new Map(canvasNodes.map((node) => [node.id, node]));

  const canvasEdges = sanitizedGraph.edges.flatMap((edge) => {
    const sourceNode = canvasNodeById.get(edge.source);
    const targetNode = canvasNodeById.get(edge.target);

    if (!sourceNode || !targetNode) {
      return [];
    }

    const { fromSide, toSide } = resolveEdgeSides(sourceNode, targetNode);

    return [
      {
        id: edge.id,
        fromNode: edge.source,
        fromSide,
        toNode: edge.target,
        toSide,
        label: buildEdgeLabel(edge),
        color: EDGE_COLOR,
      },
    ];
  });

  return {
    nodes: canvasNodes,
    edges: canvasEdges,
  };
}

function sanitizeGraph(graph: Graph): Graph {
  const rawNodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const rawEdges = Array.isArray(graph.edges) ? graph.edges : [];
  const seenNodeIds = new Set<string>();
  const nodes: Node[] = [];

  for (const candidate of rawNodes) {
    if (!candidate || typeof candidate !== 'object') {
      continue;
    }

    const node = candidate as Partial<Node>;
    const id = toOptionalString(node.id);

    if (!id || seenNodeIds.has(id)) {
      continue;
    }

    seenNodeIds.add(id);
    nodes.push({
      id,
      label: toOptionalString(node.label) ?? id,
      type: toOptionalString(node.type) ?? 'other',
      metadata: node.metadata,
    });
  }

  const seenEdgeIds = new Set<string>();
  const edges: Edge[] = [];

  for (const candidate of rawEdges) {
    if (!candidate || typeof candidate !== 'object') {
      continue;
    }

    const edge = candidate as Partial<Edge>;
    const id = toOptionalString(edge.id);
    const source = toOptionalString(edge.source);
    const target = toOptionalString(edge.target);

    if (!id || !source || !target || seenEdgeIds.has(id)) {
      continue;
    }

    if (!seenNodeIds.has(source) || !seenNodeIds.has(target)) {
      continue;
    }

    seenEdgeIds.add(id);
    const type = toOptionalString(edge.type) ?? 'related_to';

    edges.push({
      id,
      source,
      target,
      type,
      label: toOptionalString(edge.label) ?? humanizeRelation(type),
      metadata: edge.metadata,
    });
  }

  return { nodes, edges };
}

function measureNode(node: Node): Pick<MeasuredNode, 'width' | 'height' | 'text' | 'color'> {
  const label = node.label.trim() || node.id;
  const type = node.type.trim() || 'other';
  const width = clamp(220 + Math.max(0, Math.min(label.length - 12, 32)) * 4, 220, 360);
  const labelLineWidth = Math.max(16, Math.floor((width - 48) / 8));
  const typeLineWidth = Math.max(16, Math.floor((width - 48) / 9));
  const labelLines = countWrappedLines(label, labelLineWidth);
  const typeLines = countWrappedLines(`Type: ${type}`, typeLineWidth);
  const height = clamp(92 + labelLines * 30 + typeLines * 22, 110, 220);

  return {
    width,
    height,
    text: `# ${label}\n\nType: ${type}`,
    color: NODE_COLORS[type] ?? '#475569',
  };
}

function buildComponentLayouts(
  nodes: MeasuredNode[],
  edges: Edge[],
  options: Required<CanvasExportOptions>,
): ComponentLayout[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const adjacency = new Map(nodes.map((node) => [node.id, new Set<string>()]));

  for (const edge of edges) {
    if (edge.source === edge.target) {
      continue;
    }

    adjacency.get(edge.source)?.add(edge.target);
    adjacency.get(edge.target)?.add(edge.source);
  }

  const layouts: ComponentLayout[] = [];
  const visited = new Set<string>();

  for (const node of nodes) {
    if (visited.has(node.id)) {
      continue;
    }

    const componentNodeIds = collectComponentNodeIds(node.id, adjacency, visited);
    const componentNodes = componentNodeIds
      .map((nodeId) => nodeById.get(nodeId))
      .filter((candidate): candidate is MeasuredNode => candidate !== undefined)
      .sort((left, right) => left.id.localeCompare(right.id));
    const componentNodeSet = new Set(componentNodeIds);
    const componentEdges = edges.filter(
      (edge) => componentNodeSet.has(edge.source) && componentNodeSet.has(edge.target),
    );
    const layout = layoutComponent(componentNodes, componentEdges, options);

    layouts.push({
      anchorId: componentNodes[0]?.id ?? node.id,
      area: layout.width * layout.height,
      width: layout.width,
      height: layout.height,
      positions: layout.positions,
    });
  }

  return layouts.sort(
    (left, right) => right.area - left.area || left.anchorId.localeCompare(right.anchorId),
  );
}

function collectComponentNodeIds(
  startNodeId: string,
  adjacency: Map<string, Set<string>>,
  visited: Set<string>,
): string[] {
  const componentNodeIds: string[] = [];
  const queue = [startNodeId];
  visited.add(startNodeId);

  for (let index = 0; index < queue.length; index++) {
    const currentId = queue[index];
    if (!currentId) {
      continue;
    }

    componentNodeIds.push(currentId);

    for (const neighborId of adjacency.get(currentId) ?? []) {
      if (visited.has(neighborId)) {
        continue;
      }

      visited.add(neighborId);
      queue.push(neighborId);
    }
  }

  return componentNodeIds;
}

function layoutComponent(
  nodes: MeasuredNode[],
  edges: Edge[],
  options: Required<CanvasExportOptions>,
): Pick<ComponentLayout, 'width' | 'height' | 'positions'> {
  if (nodes.length === 0) {
    return { width: 0, height: 0, positions: new Map() };
  }

  if (nodes.length === 1) {
    const node = nodes[0];
    if (!node) {
      return { width: 0, height: 0, positions: new Map() };
    }

    return {
      width: node.width,
      height: node.height,
      positions: new Map([[node.id, { x: 0, y: 0 }]]),
    };
  }

  const graph = new dagre.graphlib.Graph();
  graph.setGraph({
    rankdir: options.rankdir,
    align: options.align,
    nodesep: options.nodesep,
    edgesep: options.edgesep,
    ranksep: options.ranksep,
    ranker: options.ranker,
    acyclicer: options.acyclicer,
    marginx: 0,
    marginy: 0,
  });
  graph.setDefaultEdgeLabel(() => ({}));

  for (const node of nodes) {
    graph.setNode(node.id, {
      label: node.text,
      width: node.width,
      height: node.height,
    });
  }

  for (const edge of [...edges].sort((left, right) => left.id.localeCompare(right.id))) {
    if (edge.source === edge.target) {
      continue;
    }

    graph.setEdge(edge.source, edge.target, {
      weight: 1,
      minlen: 1,
    });
  }

  dagre.layout(graph);

  const positions = new Map<string, Point>();

  for (const node of nodes) {
    const layoutNode = graph.node(node.id);
    if (!layoutNode) {
      continue;
    }

    positions.set(node.id, {
      x: Math.round(layoutNode.x - node.width / 2),
      y: Math.round(layoutNode.y - node.height / 2),
    });
  }

  const graphLabel = graph.graph();

  return {
    width: Math.ceil(graphLabel.width ?? computeLayoutExtent(nodes, positions, 'width')),
    height: Math.ceil(graphLabel.height ?? computeLayoutExtent(nodes, positions, 'height')),
    positions,
  };
}

function computeLayoutExtent(
  nodes: MeasuredNode[],
  positions: Map<string, Point>,
  dimension: 'width' | 'height',
): number {
  let extent = 0;

  for (const node of nodes) {
    const position = positions.get(node.id);
    if (!position) {
      continue;
    }

    const boundary = position[dimension === 'width' ? 'x' : 'y'] + node[dimension];
    extent = Math.max(extent, boundary);
  }

  return extent;
}

function packComponents(
  layouts: ComponentLayout[],
  options: Required<CanvasExportOptions>,
): Map<string, Point> {
  const packedPositions = new Map<string, Point>();
  const totalArea = layouts.reduce((sum, layout) => sum + layout.area, 0);
  const targetRowWidth = Math.max(
    1400,
    Math.ceil(Math.sqrt(totalArea || 1) * 1.4) + options.padding * 2,
  );

  let cursorX = options.padding;
  let cursorY = options.padding;
  let rowHeight = 0;

  for (const layout of layouts) {
    if (cursorX > options.padding && cursorX + layout.width > targetRowWidth) {
      cursorX = options.padding;
      cursorY += rowHeight + options.componentGap;
      rowHeight = 0;
    }

    for (const [nodeId, position] of layout.positions) {
      packedPositions.set(nodeId, {
        x: position.x + cursorX,
        y: position.y + cursorY,
      });
    }

    cursorX += layout.width + options.componentGap;
    rowHeight = Math.max(rowHeight, layout.height);
  }

  return packedPositions;
}

function resolveEdgeSides(
  sourceNode: CanvasTextNode,
  targetNode: CanvasTextNode,
): { fromSide: CanvasSide; toSide: CanvasSide } {
  if (sourceNode.id === targetNode.id) {
    return {
      fromSide: 'right',
      toSide: 'top',
    };
  }

  const sourceCenterX = sourceNode.x + sourceNode.width / 2;
  const sourceCenterY = sourceNode.y + sourceNode.height / 2;
  const targetCenterX = targetNode.x + targetNode.width / 2;
  const targetCenterY = targetNode.y + targetNode.height / 2;
  const deltaX = targetCenterX - sourceCenterX;
  const deltaY = targetCenterY - sourceCenterY;

  if (Math.abs(deltaX) >= Math.abs(deltaY)) {
    return deltaX >= 0
      ? { fromSide: 'right', toSide: 'left' }
      : { fromSide: 'left', toSide: 'right' };
  }

  return deltaY >= 0
    ? { fromSide: 'bottom', toSide: 'top' }
    : { fromSide: 'top', toSide: 'bottom' };
}

function buildEdgeLabel(edge: Edge): string {
  const relationLabel = edge.label.trim();
  const relationTypeLabel = humanizeRelation(edge.type);

  if (!relationLabel) {
    return relationTypeLabel;
  }

  if (normalizeText(relationLabel) === normalizeText(relationTypeLabel)) {
    return relationLabel;
  }

  // return `${edge.type}: ${relationLabel}`;
  return `${edge.type}`;
}

function humanizeRelation(value: string): string {
  return value.replaceAll('_', ' ');
}

function countWrappedLines(value: string, maxCharactersPerLine: number): number {
  const words = value.trim().split(/\s+/).filter(Boolean);

  if (words.length === 0) {
    return 1;
  }

  let lineCount = 1;
  let currentLineLength = 0;

  for (const word of words) {
    const wordLength = word.length;

    if (currentLineLength === 0) {
      lineCount += Math.floor(wordLength / maxCharactersPerLine);
      currentLineLength = wordLength % maxCharactersPerLine;
      if (currentLineLength === 0) {
        currentLineLength = maxCharactersPerLine;
      }
      continue;
    }

    if (currentLineLength + 1 + wordLength <= maxCharactersPerLine) {
      currentLineLength += 1 + wordLength;
      continue;
    }

    lineCount++;
    lineCount += Math.floor(Math.max(0, wordLength - 1) / maxCharactersPerLine);
    currentLineLength = wordLength % maxCharactersPerLine;

    if (currentLineLength === 0) {
      currentLineLength = maxCharactersPerLine;
    }
  }

  return lineCount;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function toOptionalString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  if (typeof value === 'number' || typeof value === 'bigint') {
    return String(value);
  }

  return undefined;
}
