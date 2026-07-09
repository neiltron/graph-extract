#!/usr/bin/env python3
"""Production-path eval: tuned vs base models through the real CLI.

Runs each model on the full-length held-out test docs in single mode, in two
response formats — json_schema (production default: grammar-constrained) and
text (raw: measures learned behavior with no decode-time help) — and scores
every graph against the gpt-5.5 teacher references.
"""
from __future__ import annotations

import json
import subprocess
import sys
import time
from pathlib import Path

EXP = Path(__file__).resolve().parents[1]
REPO = EXP.parents[1]
DOCS = EXP / 'data' / 'test-docs'
REFS = EXP / 'data' / 'teacher55-out-test'
OUT = EXP / 'data' / 'cli-eval'
WORKLOG = [sys.executable, str(EXP / 'bin' / 'worklog.py')]

sys.path.insert(0, str(EXP / 'bin'))
from eval_model import score  # scoring only; mlx import lives inside its main()

MODELS = ['qwen3.5-2b-mlx', 'qwen3.5-2b-lora-2k', 'google/gemma-3-4b', 'gemma-3-4b-lora-2k']
FORMATS = ['json_schema', 'text']


def wl(*args):
    subprocess.run(WORKLOG + list(args), check=False)


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    wl('start', '--id', 'cli-eval', '--parent', 'distill', '--actor', 'claude',
       '--kind', 'batch', '--label', 'CLI eval: tuned vs base, json_schema vs text')

    results = []
    for model in MODELS:
        for fmt in FORMATS:
            for doc in sorted(DOCS.glob('*.md')):
                slug = f"{model.replace('/', '_')}__{doc.stem}__{fmt}"
                out_file = OUT / f'{slug}.json'
                if out_file.exists():
                    graph = json.loads(out_file.read_text())
                    ref = json.loads((REFS / f'{doc.stem}.json').read_text())
                    row = {'model': model, 'fmt': fmt, 'doc': doc.stem, 'seconds': None,
                           'exit': 0, 'cached': True,
                           'nodes': len(graph.get('nodes', [])), 'edges': len(graph.get('edges', []))}
                    row.update(score(graph, ref))
                    results.append(row)
                    continue
                run_id = f'cli-eval:{slug}'
                wl('start', '--id', run_id, '--parent', 'cli-eval',
                   '--actor', f'lmstudio:{model}', '--kind', 'llm_run', '--label', slug)
                started = time.monotonic()
                proc = subprocess.run(
                    ['bun', 'run', 'apps/cli/src/index.ts',
                     '-i', str(doc), '-o', str(out_file),
                     '-m', model, '--mode', 'single',
                     '--max-nodes', '25', '--max-edges', '40',
                     '--response-format', fmt, '--request-timeout', '480'],
                    cwd=str(REPO), capture_output=True, text=True, timeout=600,
                )
                secs = round(time.monotonic() - started, 1)

                row = {'model': model, 'fmt': fmt, 'doc': doc.stem, 'seconds': secs,
                       'exit': proc.returncode}
                if proc.returncode == 0 and out_file.exists():
                    graph = json.loads(out_file.read_text())
                    ref = json.loads((REFS / f'{doc.stem}.json').read_text())
                    row.update(score(graph, ref))
                    row['nodes'] = len(graph.get('nodes', []))
                    row['edges'] = len(graph.get('edges', []))
                else:
                    row.update(score(None, {}))
                    tail = proc.stderr.strip().splitlines()[-1][:150] if proc.stderr.strip() else ''
                    row['error'] = tail
                results.append(row)
                wl('end', '--id', run_id,
                   '--status', 'ok' if row.get('json_valid') else 'failed',
                   '--detail', json.dumps({k: row[k] for k in ('seconds', 'node_f1', 'json_valid') if k in row}))
                print(json.dumps(row), flush=True)

    (EXP / 'results' / 'cli-eval.json').write_text(json.dumps(results, indent=1))
    wl('end', '--id', 'cli-eval', '--status', 'ok')
    print(f'wrote {EXP}/results/cli-eval.json ({len(results)} runs)')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
