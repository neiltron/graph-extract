#!/usr/bin/env python3
"""Eval the staged pipeline (snippet scope) with and without the tuned
relationship-stage model, on held-out docs, vs gpt-5.5 references."""
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
OUT = EXP / 'data' / 'stage-eval'

sys.path.insert(0, str(EXP / 'bin'))
from eval_model import score

TUNED = sys.argv[1] if len(sys.argv) > 1 else 'qwen2b-relstage-fused'
CONFIGS = [
    ('base-stage', []),
    ('tuned-stage', ['--stage-model', f'relationship={TUNED}']),
]


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    rows = []
    for tag, extra in CONFIGS:
        for doc in sorted(DOCS.glob('*.md')):
            out_file = OUT / f'{tag}__{doc.stem}.json'
            started = time.monotonic()
            proc = subprocess.run(
                ['bun', 'run', 'apps/cli/src/index.ts',
                 '-i', str(doc), '-o', str(out_file),
                 '-m', 'qwen3.5-2b-mlx', '--mode', 'staged',
                 '--relationship-scope', 'snippet',
                 '--max-nodes', '25', '--max-edges', '40',
                 '--request-timeout', '480', *extra],
                cwd=str(REPO), capture_output=True, text=True, timeout=900,
            )
            secs = round(time.monotonic() - started, 1)
            row = {'tag': tag, 'doc': doc.stem, 'seconds': secs, 'exit': proc.returncode}
            if proc.returncode == 0 and out_file.exists():
                graph = json.loads(out_file.read_text())
                row.update(score(graph, json.loads((REFS / f'{doc.stem}.json').read_text())))
                row['nodes'] = len(graph['nodes'])
                row['edges'] = len(graph['edges'])
            else:
                row['error'] = (proc.stderr.strip().splitlines() or [''])[-1][:150]
            rows.append(row)
            print(json.dumps(row), flush=True)

    (EXP / 'results' / 'stage-eval.json').write_text(json.dumps(rows, indent=1))
    for tag, _ in CONFIGS:
        rs = [r for r in rows if r['tag'] == tag and 'node_f1' in r]
        if rs:
            def mean(k): return round(sum(r[k] for r in rs) / len(rs), 3)
            print(f"{tag}: node_f1={mean('node_f1')} edge_f1_typed={mean('edge_f1_directed')} "
                  f"pair_dir={mean('edge_f1_pairs_directed')} edges={mean('edges')}")
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
