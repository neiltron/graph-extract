#!/usr/bin/env python3
"""Evaluate a (possibly LoRA-adapted) MLX model on the held-out test docs.

Generates a graph for each test doc using the exact production prompt, parses
tolerantly, and scores against the 31B teacher references. The directed vs
undirected pair-F1 gap isolates edge-direction errors.

Run under the experiment venv:
  data/mlx-venv/bin/python bin/eval_model.py --tag base
  data/mlx-venv/bin/python bin/eval_model.py --tag lora --adapter-path data/adapters
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import time
from pathlib import Path

EXP = Path(__file__).resolve().parents[1]
REPO = EXP.parents[1]
DOCS = EXP / 'data' / 'test-docs'
REFS = EXP / 'data' / 'teacher-out-test'
RESULTS = EXP / 'data' / 'results'
WORKLOG = [sys.executable, str(EXP / 'bin' / 'worklog.py')]

MODEL_PATH = '/Users/neil/.cache/lm-studio/models/Qwen3.5-2B-6bit'


def wl(*args):
    subprocess.run(WORKLOG + list(args), check=False)


def build_prompt(doc: Path) -> str:
    proc = subprocess.run(
        ['bun', 'run', str(EXP / 'bin' / 'export_prompt.ts'), str(doc)],
        cwd=str(REPO), capture_output=True, text=True, check=True,
    )
    return proc.stdout


def parse_graph(raw: str) -> dict | None:
    cleaned = re.sub(r'<think>.*?</think>', '', raw, flags=re.S)
    cleaned = re.sub(r'^```(?:json)?\s*', '', cleaned.strip())
    cleaned = re.sub(r'```\s*$', '', cleaned.strip())
    start, end = cleaned.find('{'), cleaned.rfind('}')
    if start == -1 or end <= start:
        return None
    try:
        graph = json.loads(cleaned[start:end + 1])
    except json.JSONDecodeError:
        return None
    if not isinstance(graph, dict) or not isinstance(graph.get('nodes'), list):
        return None
    return graph


def label_map(graph: dict) -> dict[str, str]:
    return {
        n.get('id'): str(n.get('label', '')).strip().lower()
        for n in graph.get('nodes', []) if isinstance(n, dict)
    }


def edge_views(graph: dict):
    labels = label_map(graph)
    typed, directed, undirected = set(), set(), set()
    for e in graph.get('edges', []):
        if not isinstance(e, dict):
            continue
        s, t = labels.get(e.get('source')), labels.get(e.get('target'))
        if not s or not t:
            continue
        rel = str(e.get('type', '')).strip().lower()
        typed.add((s, t, rel))
        directed.add((s, t))
        undirected.add(frozenset((s, t)) if s != t else frozenset((s, f'{t}#self')))
    return typed, directed, undirected


def f1(pred: set, ref: set) -> float:
    if not pred and not ref:
        return 1.0
    if not pred or not ref:
        return 0.0
    tp = len(pred & ref)
    precision = tp / len(pred)
    recall = tp / len(ref)
    return 2 * precision * recall / (precision + recall) if tp else 0.0


def score(graph: dict | None, ref: dict) -> dict:
    if graph is None:
        return {'json_valid': False, 'node_f1': 0.0, 'edge_f1_directed': 0.0,
                'edge_f1_pairs_directed': 0.0, 'edge_f1_pairs_undirected': 0.0}
    pred_nodes = {v for v in label_map(graph).values() if v}
    ref_nodes = {v for v in label_map(ref).values() if v}
    pt, pd, pu = edge_views(graph)
    rt, rd, ru = edge_views(ref)
    return {
        'json_valid': True,
        'node_f1': round(f1(pred_nodes, ref_nodes), 4),
        'edge_f1_directed': round(f1(pt, rt), 4),
        'edge_f1_pairs_directed': round(f1(pd, rd), 4),
        'edge_f1_pairs_undirected': round(f1(pu, ru), 4),
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--tag', required=True)
    ap.add_argument('--adapter-path')
    ap.add_argument('--max-tokens', type=int, default=4096)
    args = ap.parse_args()

    from mlx_lm import generate, load

    RESULTS.mkdir(parents=True, exist_ok=True)
    eval_id = f'eval-{args.tag}'
    wl('start', '--id', eval_id, '--parent', 'distill', '--actor', 'mlx:eval',
       '--kind', 'eval', '--label', f'Eval {args.tag} on held-out test docs',
       '--detail', json.dumps({'adapter': args.adapter_path}))

    model, tokenizer = load(MODEL_PATH, adapter_path=args.adapter_path)

    docs = {}
    for doc in sorted(DOCS.glob('*.md')):
        ref_file = REFS / f'{doc.stem}.json'
        if not ref_file.exists():
            print(f'{doc.stem}: no teacher reference, skipping', flush=True)
            continue

        run_id = f'{eval_id}:{doc.stem}'
        wl('start', '--id', run_id, '--parent', eval_id, '--actor', 'mlx:eval',
           '--kind', 'llm_run', '--label', doc.stem)
        prompt_text = build_prompt(doc)
        chat_prompt = tokenizer.apply_chat_template(
            [{'role': 'user', 'content': prompt_text}],
            add_generation_prompt=True,
            enable_thinking=False,
        )
        started = time.monotonic()
        raw = generate(model, tokenizer, prompt=chat_prompt, max_tokens=args.max_tokens)
        secs = round(time.monotonic() - started, 1)

        graph = parse_graph(raw)
        metrics = score(graph, json.loads(ref_file.read_text()))
        metrics['seconds'] = secs
        metrics['raw_chars'] = len(raw)
        docs[doc.stem] = metrics
        wl('end', '--id', run_id, '--status', 'ok' if metrics['json_valid'] else 'failed',
           '--detail', json.dumps(metrics))
        print(f'{doc.stem}: {json.dumps(metrics)}', flush=True)

    metric_keys = ['node_f1', 'edge_f1_directed', 'edge_f1_pairs_directed', 'edge_f1_pairs_undirected']
    means = {
        key: round(sum(d[key] for d in docs.values()) / len(docs), 4) if docs else 0.0
        for key in metric_keys
    }
    means['json_valid_rate'] = (
        round(sum(1 for d in docs.values() if d['json_valid']) / len(docs), 4) if docs else 0.0
    )

    out = {'tag': args.tag, 'adapter': args.adapter_path, 'model': MODEL_PATH,
           'docs': docs, 'means': means}
    out_file = RESULTS / f'eval-{args.tag}.json'
    out_file.write_text(json.dumps(out, indent=2))
    wl('end', '--id', eval_id, '--status', 'ok', '--detail', json.dumps(means))
    print(f'wrote {out_file}')
    print(json.dumps(means, indent=2))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
