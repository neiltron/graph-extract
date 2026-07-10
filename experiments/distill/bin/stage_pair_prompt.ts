// Print the snippet-local relationship prompt for one snippet of a stage-inputs file.
// Usage: bun run stage_pair_prompt.ts <stage-inputs.json> <snippet-id>
import { buildRelationshipPrompt } from '../../../packages/graph-extract/src/staged-prompt.ts';

const [inputsFile, snippetId] = process.argv.slice(2);
const inputs = await Bun.file(inputsFile).json();
const snippet = inputs.snippets.find((s: { id: string }) => s.id === snippetId);
if (!snippet) {
  console.error(`snippet ${snippetId} not found`);
  process.exit(1);
}
const snippetCatalog = inputs.catalog.filter((e: { id: string }) => snippet.entityIds.includes(e.id));
// Global edge caps are enforced at compile; no per-snippet cap.
process.stdout.write(
  buildRelationshipPrompt(snippetCatalog, inputs.relationTypes, [snippet], { maxNodes: 25 }),
);
