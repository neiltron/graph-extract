#!/usr/bin/env python3
"""Label snippet-local relationship pairs with gpt-5.5 via a pi RPC session.

Shardable for parallel workers:
  label_pairs.py <session> <shard> <num-shards> [inputs-dir] [out-dir]
Each pair file: {"stem", "snippet_id", "prompt", "target"} — target is the
compact relationships JSON, filtered to valid snippet entity IDs.
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
import time
from pathlib import Path

EXP = Path(__file__).resolve().parents[1]
REPO = EXP.parents[1]
SESSION = sys.argv[1]
SHARD = int(sys.argv[2])
NSHARDS = int(sys.argv[3])
INPUTS = Path(sys.argv[4]).resolve() if len(sys.argv) > 4 else EXP / 'data' / 'stage-inputs'
OUT = Path(sys.argv[5]).resolve() if len(sys.argv) > 5 else EXP / 'data' / 'stage-pairs'
WORKLOG = [sys.executable, str(EXP / 'bin' / 'worklog.py')]

FIFO = EXP / 'data' / f'{SESSION}.in'
LOG = EXP / 'data' / f'{SESSION}.log'

PREAMBLE = (
    'You are acting as a pure data-labeling function. Respond with ONLY the JSON object '
    'requested below - no markdown fences, no commentary, no tool use, no shell commands. '
    'Prefer precision over recall: include only relationships explicitly stated in the '
    'snippet, with source_id as the subject; when unsure, omit the relationship. An empty '
    'relationships array is a perfectly good answer.\n\n'
)


def wl(*args):
    subprocess.run(WORKLOG + list(args), check=False)


def send(obj):
    with open(FIFO, 'w') as fh:
        fh.write(json.dumps(obj) + '\n')


def count_ends() -> int:
    try:
        return sum(1 for line in open(LOG, 'rb') if b'"agent_end"' in line)
    except FileNotFoundError:
        return 0


def last_text() -> str:
    ev = None
    for line in open(LOG, 'rb'):
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


def ask(prompt: str, timeout: float = 180.0) -> str | None:
    send({'type': 'new_session'})
    time.sleep(1.5)
    before = count_ends()
    send({'type': 'prompt', 'message': prompt})
    deadline = time.time() + timeout
    while time.time() < deadline:
        if count_ends() > before:
            return last_text()
        time.sleep(1.5)
    return None


def parse_relationships(raw: str, entity_ids: set[str], relation_names: set[str]):
    cleaned = re.sub(r'^```(?:json)?\s*|```\s*$', '', raw.strip())
    start, end = cleaned.find('{'), cleaned.rfind('}')
    if start == -1 or end <= start:
        return None
    try:
        obj = json.loads(cleaned[start:end + 1])
    except json.JSONDecodeError:
        return None
    rels = obj.get('relationships')
    if not isinstance(rels, list):
        return None
    kept = []
    for r in rels:
        if not isinstance(r, dict):
            continue
        if r.get('source_id') in entity_ids and r.get('target_id') in entity_ids \
                and str(r.get('type', '')).lower() in relation_names:
            kept.append({
                'source_id': r['source_id'], 'target_id': r['target_id'],
                'type': str(r['type']).lower(), 'snippet_id': r.get('snippet_id', ''),
                'mention': str(r.get('mention', ''))[:160],
            })
    return kept


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    batch = f'pairs:{SESSION}'
    docs = [f for i, f in enumerate(sorted(INPUTS.glob('*.json'))) if i % NSHARDS == SHARD]
    wl('start', '--id', batch, '--parent', 'distill', '--actor', f'pi:{SESSION}(gpt-5.5)',
       '--kind', 'batch', '--label', f'Label snippet pairs, shard {SHARD}/{NSHARDS} ({len(docs)} docs)')

    done = failed = 0
    for doc in docs:
        inputs = json.loads(doc.read_text())
        relation_names = {rt['name'] for rt in inputs['relationTypes']}
        for snippet in inputs['snippets']:
            if len(snippet['entityIds']) < 2:
                continue
            out_file = OUT / f"{inputs['stem']}__{snippet['id']}.json"
            if out_file.exists():
                done += 1
                continue

            proc = subprocess.run(
                ['bun', 'run', str(EXP / 'bin' / 'stage_pair_prompt.ts'), str(doc), snippet['id']],
                cwd=str(REPO), capture_output=True, text=True,
            )
            if proc.returncode != 0:
                failed += 1
                continue
            prompt = proc.stdout

            raw = ask(PREAMBLE + prompt)
            rels = parse_relationships(raw or '', set(snippet['entityIds']), relation_names)
            if rels is None:
                failed += 1
                print(f"{inputs['stem']}/{snippet['id']}: FAILED", flush=True)
                continue

            target = json.dumps({'relationships': rels}, separators=(',', ':'))
            out_file.write_text(json.dumps({
                'stem': inputs['stem'], 'snippet_id': snippet['id'],
                'prompt': prompt, 'target': target, 'n_rels': len(rels),
            }))
            done += 1
            print(f"{inputs['stem']}/{snippet['id']}: {len(rels)} rels", flush=True)

    wl('end', '--id', batch, '--status', 'ok' if failed == 0 else 'failed',
       '--detail', json.dumps({'pairs': done, 'failed': failed}))
    print(f'shard {SHARD}: {done} pairs, {failed} failed', flush=True)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
