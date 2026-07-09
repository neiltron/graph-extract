#!/usr/bin/env python3
"""Label docs with gpt-5.5 as teacher, via a pi RPC session.

pi carries the gpt-5.5 credentials; we use its RPC new_session command to give
every document a fresh context, ask for raw JSON only, then clean the output
through the repo's own parse/validate/caps pipeline (clean_graph.ts) so labels
are distribution-identical to CLI outputs.

Usage: gpt55_teacher.py <session-name> [docs-dir] [out-dir] [batch-id]
(The pi_driver.py session must already be running.)
"""
from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import time
from pathlib import Path

EXP = Path(__file__).resolve().parents[1]
REPO = EXP.parents[1]
SESSION = sys.argv[1] if len(sys.argv) > 1 else 'teacher55'
DOCS = Path(sys.argv[2]).resolve() if len(sys.argv) > 2 else EXP / 'data' / 'train-docs'
OUT = Path(sys.argv[3]).resolve() if len(sys.argv) > 3 else EXP / 'data' / 'teacher55-out'
BATCH_ID = sys.argv[4] if len(sys.argv) > 4 else 'teacher55'
WORKLOG = [sys.executable, str(EXP / 'bin' / 'worklog.py')]

FIFO = EXP / 'data' / f'{SESSION}.in'
LOG = EXP / 'data' / f'{SESSION}.log'

PREAMBLE = (
    'You are acting as a pure data-labeling function. Respond with ONLY the JSON object '
    'requested below - no markdown fences, no commentary, no tool use, no shell commands. '
    'Produce the highest-quality extraction you can; pay careful attention to edge '
    'direction (source is the subject of the relation).\n\n'
)


def wl(*args):
    subprocess.run(WORKLOG + list(args), check=False)


def send(obj):
    with open(FIFO, 'w') as fh:
        fh.write(json.dumps(obj) + '\n')


def count_agent_ends() -> int:
    n = 0
    try:
        with open(LOG, 'rb') as fh:
            for line in fh:
                if b'"agent_end"' in line:
                    n += 1
    except FileNotFoundError:
        pass
    return n


def last_assistant_text() -> str:
    ev = None
    with open(LOG, 'rb') as fh:
        for line in fh:
            if b'"agent_end"' in line:
                try:
                    cand = json.loads(line)
                    if cand.get('type') == 'agent_end':
                        ev = cand
                except (json.JSONDecodeError, UnicodeDecodeError):
                    pass
    if not ev:
        return ''
    texts = []
    for msg in ev.get('messages', []):
        if msg.get('role') != 'assistant':
            continue
        content = msg.get('content')
        if isinstance(content, str):
            texts.append(content)
        elif isinstance(content, list):
            texts.extend(c.get('text', '') for c in content
                         if isinstance(c, dict) and c.get('type') == 'text')
    return '\n'.join(texts)


def ask(prompt: str, timeout: float = 240.0) -> str | None:
    send({'type': 'new_session'})
    time.sleep(2)
    before = count_agent_ends()
    send({'type': 'prompt', 'message': prompt})
    deadline = time.time() + timeout
    while time.time() < deadline:
        if count_agent_ends() > before:
            return last_assistant_text()
        time.sleep(2)
    return None


def build_prompt(doc: Path) -> str:
    proc = subprocess.run(
        ['bun', 'run', str(EXP / 'bin' / 'export_prompt.ts'), str(doc)],
        cwd=str(REPO), capture_output=True, text=True, check=True,
    )
    return proc.stdout


def clean(raw: str, out_file: Path) -> dict | None:
    with tempfile.NamedTemporaryFile('w', suffix='.txt', delete=False) as tf:
        tf.write(raw)
        tmp = tf.name
    proc = subprocess.run(
        ['bun', 'run', str(EXP / 'bin' / 'clean_graph.ts'), tmp, str(out_file)],
        cwd=str(REPO), capture_output=True, text=True,
    )
    Path(tmp).unlink(missing_ok=True)
    if proc.returncode != 0:
        return None
    return json.loads(proc.stdout)


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    docs = sorted(DOCS.glob('*.md'))
    wl('start', '--id', BATCH_ID, '--parent', 'distill', '--actor', 'pi:teacher55(gpt-5.5)',
       '--kind', 'batch', '--label', f'gpt-5.5 teacher-label {len(docs)} docs via pi RPC')

    done = failed = 0
    for doc in docs:
        out_file = OUT / f'{doc.stem}.json'
        if out_file.exists():
            done += 1
            continue

        run_id = f'{BATCH_ID}:{doc.stem}'
        wl('start', '--id', run_id, '--parent', BATCH_ID, '--actor', 'pi:teacher55(gpt-5.5)',
           '--kind', 'llm_run', '--label', doc.stem)
        started = time.monotonic()
        raw = ask(PREAMBLE + build_prompt(doc))
        secs = round(time.monotonic() - started, 1)

        counts = clean(raw, out_file) if raw else None
        if counts and counts.get('nodes'):
            done += 1
            wl('end', '--id', run_id, '--status', 'ok',
               '--detail', json.dumps({'seconds': secs, **counts}))
            print(f'{doc.stem}: ok {secs}s ({counts["nodes"]}n/{counts["edges"]}e)', flush=True)
        else:
            failed += 1
            out_file.unlink(missing_ok=True)
            wl('end', '--id', run_id, '--status', 'failed',
               '--detail', json.dumps({'seconds': secs, 'raw_chars': len(raw or '')}))
            print(f'{doc.stem}: FAILED {secs}s', flush=True)

    wl('end', '--id', BATCH_ID, '--status', 'ok' if failed == 0 else 'failed',
       '--detail', json.dumps({'labeled': done, 'failed': failed}))
    print(f'gpt-5.5 labeling complete: {done} ok, {failed} failed', flush=True)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
