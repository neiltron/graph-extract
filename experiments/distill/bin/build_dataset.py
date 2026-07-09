#!/usr/bin/env python3
"""Build mlx-lm chat-format training data from teacher-labeled pairs.

For every train doc with a teacher graph: user = the exact production prompt
(via export_prompt.ts), assistant = the teacher graph as compact JSON.
Deterministic split: sorted stems, every 8th to valid.
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

EXP = Path(__file__).resolve().parents[1]
REPO = EXP.parents[1]
DOCS = EXP / 'data' / 'train-docs'
LABELS = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else EXP / 'data' / 'teacher-out'
OUT = Path(sys.argv[2]).resolve() if len(sys.argv) > 2 else EXP / 'data' / 'mlx-data'
WORKLOG = [sys.executable, str(EXP / 'bin' / 'worklog.py')]


def wl(*args):
    subprocess.run(WORKLOG + list(args), check=False)


def build_prompt(doc: Path) -> str:
    proc = subprocess.run(
        ['bun', 'run', str(EXP / 'bin' / 'export_prompt.ts'), str(doc)],
        cwd=str(REPO), capture_output=True, text=True, check=True,
    )
    return proc.stdout


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    wl('start', '--id', 'dataset', '--parent', 'distill', '--actor', 'script:build_dataset',
       '--kind', 'setup', '--label', f'Build mlx dataset from {LABELS.name}')

    stems = sorted(
        doc.stem for doc in DOCS.glob('*.md') if (LABELS / f'{doc.stem}.json').exists()
    )
    train, valid = [], []
    for index, stem in enumerate(stems):
        prompt = build_prompt(DOCS / f'{stem}.md')
        graph = json.loads((LABELS / f'{stem}.json').read_text())
        record = {
            'messages': [
                {'role': 'user', 'content': prompt},
                {'role': 'assistant', 'content': json.dumps(graph, separators=(',', ':'))},
            ]
        }
        (valid if index % 8 == 7 else train).append(record)

    for name, rows in (('train', train), ('valid', valid)):
        with open(OUT / f'{name}.jsonl', 'w', encoding='utf-8') as f:
            for row in rows:
                f.write(json.dumps(row, ensure_ascii=False) + '\n')
        chars = sum(len(r['messages'][0]['content']) + len(r['messages'][1]['content']) for r in rows)
        print(f'{name}: {len(rows)} pairs, ~{chars // 4} tokens')

    wl('end', '--id', 'dataset', '--status', 'ok',
       '--detail', json.dumps({'train': len(train), 'valid': len(valid)}))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
