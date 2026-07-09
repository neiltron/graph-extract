// Print the exact single-mode extraction prompt the CLI sends for a document.
// Used to build training pairs whose inputs match production usage byte-for-byte.
import { buildPrompt } from '../../../packages/graph-extract/src/prompt.ts';
import { resolveSchema } from '../../../packages/graph-extract/src/schema.ts';

const docPath = process.argv[2];
if (!docPath) {
  console.error('usage: export_prompt.ts <doc.md>');
  process.exit(1);
}

const text = await Bun.file(docPath).text();
const schema = resolveSchema({ maxNodes: 25, maxEdges: 40 });
process.stdout.write(buildPrompt(text, schema));
