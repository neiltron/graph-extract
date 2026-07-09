// Clean a raw graph JSON exactly the way the CLI pipeline would:
// defensive parse, validation (drop invalid edges), deterministic caps.
// Keeps teacher labels distribution-identical to CLI outputs regardless of teacher.
import { parseGraph } from '../../../packages/graph-extract/src/parse.ts';
import { enforceGraphLimits, validate } from '../../../packages/graph-extract/src/validate.ts';

const [rawPath, outPath] = [process.argv[2], process.argv[3]];
if (!rawPath || !outPath) {
  console.error('usage: clean_graph.ts <raw.txt> <out.json>');
  process.exit(1);
}

const raw = await Bun.file(rawPath).text();
const graph = parseGraph(raw);
const validated = validate(graph);
const limited = enforceGraphLimits(validated.graph, { maxNodes: 25, maxEdges: 40 });
await Bun.write(outPath, JSON.stringify(limited.graph));
console.log(
  JSON.stringify({ nodes: limited.graph.nodes.length, edges: limited.graph.edges.length }),
);
