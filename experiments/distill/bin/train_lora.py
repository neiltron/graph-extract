#!/usr/bin/env python3
"""LoRA-tune the local Qwen3.5-2B (6-bit MLX) on the teacher dataset.

Wraps `mlx_lm lora` with worklog spans. ~40 pairs x 4 epochs at batch 1;
max-seq-length 4096 because production prompts are ~2.8k tokens and the
mlx-lm default of 2048 would silently truncate the targets.

Run under the experiment venv:
  data/mlx-venv/bin/python bin/train_lora.py [--iters 160]
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from pathlib import Path

EXP = Path(__file__).resolve().parents[1]
WORKLOG = [sys.executable, str(EXP / 'bin' / 'worklog.py')]
MODEL_PATH = '/Users/neil/.cache/lm-studio/models/Qwen3.5-2B-6bit'


def wl(*args):
    subprocess.run(WORKLOG + list(args), check=False)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--iters', type=int, default=160)
    ap.add_argument('--batch-size', type=int, default=1)
    ap.add_argument('--num-layers', type=int, default=16)
    ap.add_argument('--learning-rate', default='1e-4')
    ap.add_argument('--max-seq-length', type=int, default=4096)
    ap.add_argument('--adapter-path', default=str(EXP / 'data' / 'adapters'))
    args = ap.parse_args()

    cmd = [
        sys.executable, '-m', 'mlx_lm', 'lora',
        '--model', MODEL_PATH,
        '--train',
        '--data', str(EXP / 'data' / 'mlx-data'),
        '--iters', str(args.iters),
        '--batch-size', str(args.batch_size),
        '--num-layers', str(args.num_layers),
        '--learning-rate', args.learning_rate,
        '--max-seq-length', str(args.max_seq_length),
        '--adapter-path', args.adapter_path,
        '--steps-per-report', '10',
        '--steps-per-eval', '40',
        '--save-every', '40',
    ]

    wl('start', '--id', 'train', '--parent', 'distill', '--actor', 'mlx:train',
       '--kind', 'train', '--label', f'LoRA {args.iters} iters on Qwen3.5-2B-6bit',
       '--detail', json.dumps(vars(args)))
    started = time.monotonic()
    proc = subprocess.run(cmd, cwd=str(EXP))
    secs = round(time.monotonic() - started, 1)
    status = 'ok' if proc.returncode == 0 else 'failed'
    wl('end', '--id', 'train', '--status', status,
       '--detail', json.dumps({'seconds': secs, 'returncode': proc.returncode}))
    print(f'training {status} in {secs}s; adapters at {args.adapter_path}')
    return proc.returncode


if __name__ == '__main__':
    raise SystemExit(main())
