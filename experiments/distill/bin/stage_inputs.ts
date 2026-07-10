// Generate staged-pipeline intermediate state (catalog, relation types, snippets)
// for each doc, using the SMALL model for entity + schema stages so training
// inputs match the distribution the tuned model will see at inference.
// Usage: bun run stage_inputs.ts <docs-dir> <out-dir> [model]
import {
  buildEntityPrompt,
  buildEntityResponseSchema,
  buildRelationSchemaPrompt,
  buildRelationSchemaResponseSchema,
} from '../../../packages/graph-extract/src/staged-prompt.ts';
import {
  parseEntityExtraction,
  parseRelationSchemaExtraction,
} from '../../../packages/graph-extract/src/staged-parse.ts';
import {
  buildEntityCatalog,
  buildEvidenceSnippets,
} from '../../../packages/graph-extract/src/staged-context.ts';
import { resolveSchema } from '../../../packages/graph-extract/src/schema.ts';
import { readdirSync } from 'node:fs';

const [docsDir, outDir, model = 'qwen3.5-2b-mlx'] = process.argv.slice(2);
const schema = resolveSchema({ maxNodes: 25, maxEdges: 40 });

async function call(prompt: string, responseSchema: { name: string; schema: object }) {
  const res = await fetch('http://localhost:1234/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
      max_completion_tokens: 8192,
      response_format: {
        type: 'json_schema',
        json_schema: { name: responseSchema.name, schema: responseSchema.schema },
      },
    }),
  });
  const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
  return data.choices[0].message.content;
}

for (const file of readdirSync(docsDir).filter((f) => f.endsWith('.md')).sort()) {
  const stem = file.replace(/\.md$/, '');
  const outFile = `${outDir}/${stem}.json`;
  if (await Bun.file(outFile).exists()) continue;

  const text = await Bun.file(`${docsDir}/${file}`).text();
  try {
    const entityRaw = await call(buildEntityPrompt(text, schema), buildEntityResponseSchema(schema));
    const catalog = buildEntityCatalog(parseEntityExtraction(entityRaw).entities);
    const snippets = buildEvidenceSnippets(text, catalog);
    const snippetEntityIds = new Set(snippets.flatMap((s) => s.entityIds));
    const focused = catalog.filter((e) => snippetEntityIds.has(e.id));
    const focusedCatalog = focused.length > 0 ? focused : catalog;

    const schemaRaw = await call(
      buildRelationSchemaPrompt(focusedCatalog, snippets, schema),
      buildRelationSchemaResponseSchema(),
    );
    const relationTypes = parseRelationSchemaExtraction(schemaRaw).relationTypes;

    await Bun.write(outFile, JSON.stringify({ stem, catalog: focusedCatalog, relationTypes, snippets }));
    console.log(`${stem}: ${focusedCatalog.length} entities, ${snippets.length} snippets, ${relationTypes.length} relations`);
  } catch (err) {
    console.log(`${stem}: FAILED ${String(err).slice(0, 120)}`);
  }
}
