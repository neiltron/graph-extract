#!/usr/bin/env bun
import { type ExtractArgs, runExtract } from './commands/extract.js';
import { runValidate } from './commands/validate.js';

const VERSION = '0.1.0';

const HELP = `
graph-extract - LLM-based entity and relationship extraction

Usage:
  graph-extract [options]                  Extract graph from text
  graph-extract validate <file>            Validate existing graph
  graph-extract --help                     Show this help
  graph-extract --version                  Show version

Extract Options:
  -i, --input <file>     Input file (default: stdin)
  -o, --output <file>    Output file (default: stdout)
  -s, --schema <file>    Schema JSON file
  -p, --pretty           Pretty print JSON output
  --provider <type>      Provider type (default: lmstudio)
  --base-url <url>       Provider base URL
  -m, --model <name>     Model identifier

Environment Variables:
  GRAPH_EXTRACT_PROVIDER    Provider type (default: lmstudio)
  GRAPH_EXTRACT_BASE_URL    Provider base URL
  GRAPH_EXTRACT_MODEL       Model identifier
  OPENAI_API_KEY            API key for OpenAI
  ANTHROPIC_API_KEY         API key for Anthropic

Examples:
  # Extract from stdin
  echo "Alice works at Acme Corp" | graph-extract -m my-model

  # Extract from file
  graph-extract -i document.txt -o graph.json -m my-model

  # With custom schema
  graph-extract -i doc.txt -s schema.json -m my-model --pretty

  # Validate existing graph
  graph-extract validate graph.json
`;

async function main(): Promise<number> {
  const args = process.argv.slice(2);

  // Handle --help
  if (args.includes('--help') || args.includes('-h')) {
    console.log(HELP);
    return 0;
  }

  // Handle --version
  if (args.includes('--version') || args.includes('-v')) {
    console.log(`graph-extract v${VERSION}`);
    return 0;
  }

  // Handle validate subcommand
  if (args[0] === 'validate') {
    const filePath = args[1];
    if (!filePath) {
      console.error('Error: validate requires a file path');
      console.error('Usage: graph-extract validate <file>');
      return 1;
    }
    const pretty = args.includes('--pretty') || args.includes('-p');
    return runValidate(filePath, pretty);
  }

  // Parse extract arguments
  const extractArgs: ExtractArgs = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];

    switch (arg) {
      case '-i':
      case '--input':
        extractArgs.input = next;
        i++;
        break;
      case '-o':
      case '--output':
        extractArgs.output = next;
        i++;
        break;
      case '-s':
      case '--schema':
        extractArgs.schema = next;
        i++;
        break;
      case '-m':
      case '--model':
        extractArgs.model = next;
        i++;
        break;
      case '--provider':
        extractArgs.provider = next;
        i++;
        break;
      case '--base-url':
        extractArgs.baseUrl = next;
        i++;
        break;
      case '-p':
      case '--pretty':
        extractArgs.pretty = true;
        break;
    }
  }

  return runExtract(extractArgs);
}

main().then((code) => process.exit(code));
