#!/usr/bin/env bash
set -u

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
ORIGINAL_CWD="$(pwd)"

CONCEPTS_DIR="${CONCEPTS_DIR:-/Users/neil/Library/Mobile Documents/iCloud~md~obsidian/Documents/niltron/wiki/concepts}"
CANVAS_DIR="${CANVAS_DIR:-/Users/neil/Library/Mobile Documents/iCloud~md~obsidian/Documents/niltron}"
OUTPUT_DIR="${OUTPUT_DIR:-$REPO_ROOT/outputs}"
MODEL="${MODEL:-google/gemma-4-e2b}"
MAX_NODES="${MAX_NODES:-16}"
MODE="${MODE:-}"

export GRAPH_EXTRACT_PROVIDER="${GRAPH_EXTRACT_PROVIDER:-lmstudio}"
export GRAPH_EXTRACT_BASE_URL="${GRAPH_EXTRACT_BASE_URL:-http://localhost:1234/v1}"

if [[ ! -d "$CONCEPTS_DIR" ]]; then
  echo "Concepts directory not found: $CONCEPTS_DIR" >&2
  exit 1
fi

mkdir -p "$OUTPUT_DIR"
mkdir -p "$CANVAS_DIR"

cd "$REPO_ROOT" || exit 1

processed=0
failed=0
found=0

while IFS= read -r -d '' file; do
  found=$((found + 1))

  name="$(basename "$file" .md)"
  json_out="$OUTPUT_DIR/${name}.json"
  canvas_out="$CANVAS_DIR/${name}.canvas"

  echo "==> $name"
  echo "    source: $file"
  echo "    json:   $json_out"
  echo "    canvas: $canvas_out"

  extract_cmd=(
    bun run apps/cli/src/index.ts
    -i "$file"
    -o "$json_out"
    -m "$MODEL"
    --max-nodes "$MAX_NODES"
  )

  if [[ -n "$MODE" ]]; then
    extract_cmd+=(--mode "$MODE")
  fi

  if ! "${extract_cmd[@]}"; then
    echo "    extract failed: $file" >&2
    failed=$((failed + 1))
    continue
  fi

  if ! bun run apps/cli/src/index.ts canvas "$json_out" -o "$canvas_out" --pretty; then
    echo "    canvas conversion failed: $json_out" >&2
    failed=$((failed + 1))
    continue
  fi

  processed=$((processed + 1))
done < <(find "$CONCEPTS_DIR" -maxdepth 1 -type f -name '*.md' ! -name 'index.md' -print0)

if [[ "$found" -eq 0 ]]; then
  echo "No markdown files found in $CONCEPTS_DIR" >&2
  exit 1
fi

echo

echo "Done. Processed: $processed, Failed: $failed, Found: $found"

if [[ "$failed" -gt 0 ]]; then
  exit 1
fi
