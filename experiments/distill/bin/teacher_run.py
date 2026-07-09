#!/usr/bin/env python3
"""Label training docs with the 31B teacher via the graph-extract CLI.

Sequential (LM Studio serves one request at a time), resumable (skips docs
whose output already exists), and logs every run to the shared worklog.

Usage: teacher_run.py [docs-dir] [out-dir] [batch-id]
"""
from __future__ import annotations

import json
import subprocess
import sys
import time
from pathlib import Path

EXP = Path(__file__).resolve().parents[1]
REPO = EXP.parents[1]
DOCS = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else EXP / 'data' / 'train-docs'
OUT = Path(sys.argv[2]).resolve() if len(sys.argv) > 2 else EXP / 'data' / 'teacher-out'
BATCH_ID = sys.argv[3] if len(sys.argv) > 3 else 'teacher'
WORKLOG = [sys.executable, str(EXP / 'bin' / 'worklog.py')]

MODEL = 'gemma-4-31b-it-uncensored-heretic'
TIMEOUT = 600


def wl(*args):
    subprocess.run(WORKLOG + list(args), check=False)


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    docs = sorted(DOCS.glob('*.md'))
    if not docs:
        print('no docs found', file=sys.stderr)
        return 2

    wl('start', '--id', BATCH_ID, '--parent', 'distill', '--actor', f'lmstudio:{MODEL}',
       '--kind', 'batch', '--label', f'Teacher-label {len(docs)} docs (single mode)')

    done = failed = 0
    for doc in docs:
        out_file = OUT / f'{doc.stem}.json'
        if out_file.exists():
            done += 1
            continue

        run_id = f'{BATCH_ID}:{doc.stem}'
        wl('start', '--id', run_id, '--parent', BATCH_ID, '--actor', f'lmstudio:{MODEL}',
           '--kind', 'llm_run', '--label', doc.stem)
        started = time.monotonic()
        try:
            proc = subprocess.run(
                ['bun', 'run', 'apps/cli/src/index.ts',
                 '-i', str(doc), '-o', str(out_file),
                 '-m', MODEL, '--mode', 'single',
                 '--max-nodes', '25', '--max-edges', '40',
                 '--request-timeout', '480'],
                cwd=str(REPO), capture_output=True, text=True, timeout=TIMEOUT,
            )
            secs = round(time.monotonic() - started, 1)
            if proc.returncode == 0 and out_file.exists():
                graph = json.loads(out_file.read_text())
                done += 1
                wl('end', '--id', run_id, '--status', 'ok', '--detail', json.dumps({
                    'seconds': secs,
                    'nodes': len(graph.get('nodes', [])),
                    'edges': len(graph.get('edges', [])),
                }))
                print(f'{doc.stem}: ok {secs}s '
                      f'({len(graph.get("nodes", []))}n/{len(graph.get("edges", []))}e)', flush=True)
            else:
                failed += 1
                out_file.unlink(missing_ok=True)
                tail = proc.stderr.strip().splitlines()[-1] if proc.stderr.strip() else f'exit {proc.returncode}'
                wl('end', '--id', run_id, '--status', 'failed',
                   '--detail', json.dumps({'seconds': secs, 'error': tail[:300]}))
                print(f'{doc.stem}: FAILED {secs}s {tail[:120]}', flush=True)
        except subprocess.TimeoutExpired:
            failed += 1
            out_file.unlink(missing_ok=True)
            wl('end', '--id', run_id, '--status', 'failed',
               '--detail', json.dumps({'seconds': TIMEOUT, 'error': 'timeout'}))
            print(f'{doc.stem}: TIMEOUT', flush=True)

    wl('end', '--id', BATCH_ID, '--status', 'ok' if failed == 0 else 'failed',
       '--detail', json.dumps({'labeled': done, 'failed': failed}))
    print(f'teacher labeling complete: {done} ok, {failed} failed', flush=True)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
