#!/usr/bin/env bun
import { type CanvasArgs, runCanvas } from './commands/canvas.js';
import { type ExtractArgs, runExtract } from './commands/extract.js';
import { runValidate } from './commands/validate.js';

const VERSION = '0.1.0';

const HELP = `
graph-extract - LLM-based entity and relationship extraction

Usage:
  graph-extract [options]                  Extract graph from text
  graph-extract validate <file>            Validate existing graph
  graph-extract canvas <file> [options]    Export graph as Obsidian canvas
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
  --api-key <key>        Provider API key
  --stop <token>         Stop sequence (repeatable)
  --response-format <type>  Response format (json_schema or json_object)
  --mode <type>          Extraction mode (single or staged)
  --max-nodes <n>        Limit nodes in output
  --max-edges <n>        Limit edges in output

Canvas Options:
  -o, --output <file>    Output file (default: stdout)
  -p, --pretty           Pretty print JSON output

Environment Variables:
  GRAPH_EXTRACT_PROVIDER    Provider type (default: lmstudio)
  GRAPH_EXTRACT_BASE_URL    Provider base URL
  GRAPH_EXTRACT_MODEL       Model identifier
  GRAPH_EXTRACT_API_KEY     Provider API key
  GRAPH_EXTRACT_STOP        Comma-separated stop sequences
  GRAPH_EXTRACT_RESPONSE_FORMAT  Response format override
  GRAPH_EXTRACT_MODE        Extraction mode override
  OPENAI_API_KEY            API key for OpenAI
  ANTHROPIC_API_KEY         API key for Anthropic

Examples:
  # Extract from stdin
  echo "Alice works at Acme Corp" | graph-extract -m my-model

  # Extract from file
  graph-extract -i document.txt -o graph.json -m my-model

  # With custom schema
  graph-extract -i doc.txt -s schema.json -m my-model --pretty

  # Use staged mode for smaller local models
  graph-extract -i doc.txt -m my-model --mode staged

  # Validate existing graph
  graph-extract validate graph.json

  # Export to Obsidian canvas
  graph-extract canvas graph.json -o graph.canvas --pretty
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

  if (args[0] === 'canvas') {
    const filePath = args[1];
    if (!filePath) {
      console.error('Error: canvas requires a file path');
      console.error('Usage: graph-extract canvas <file> [-o output.canvas] [--pretty]');
      return 1;
    }

    const canvasArgs: CanvasArgs = {};

    for (let i = 2; i < args.length; i++) {
      const arg = args[i];
      const next = args[i + 1];

      switch (arg) {
        case '-o':
        case '--output':
          canvasArgs.output = next;
          i++;
          break;
        case '-p':
        case '--pretty':
          canvasArgs.pretty = true;
          break;
      }
    }

    return runCanvas(filePath, canvasArgs);
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
      case '--api-key':
        extractArgs.apiKey = next;
        i++;
        break;
      case '--stop':
        if (next !== undefined) {
          extractArgs.stop ??= [];
          extractArgs.stop.push(next);
          i++;
        }
        break;
      case '--response-format':
        extractArgs.responseFormat = next;
        i++;
        break;
      case '--mode':
        extractArgs.mode = next;
        i++;
        break;
      case '--max-nodes':
        extractArgs.maxNodes = next;
        i++;
        break;
      case '--max-edges':
        extractArgs.maxEdges = next;
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
