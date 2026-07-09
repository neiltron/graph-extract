#!/usr/bin/env python3
"""Append-only work log for the distillation experiment.

Every unit of work — pi agent tasks, LM Studio runs, training, eval — appends
events here so the whole effort can later be rendered as a tree or timeline.

Usage:
  worklog.py start --id ID [--parent ID] --actor A --kind K --label L [--detail JSON]
  worklog.py end   --id ID [--status ok|failed] [--detail JSON]
  worklog.py note  --id ID --label L [--actor A] [--detail JSON]

Actors: claude | pi:<session> | lmstudio:<model> | mlx:<job> | script:<name>
Kinds:  phase | agent_task | llm_run | batch | train | eval | setup | note
"""
import argparse
import datetime
import fcntl
import json
import os

LOG = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'worklog.jsonl')
LOG = os.path.abspath(LOG)


def append(record):
    record['ts'] = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds')
    with open(LOG, 'a', encoding='utf-8') as f:
        fcntl.flock(f, fcntl.LOCK_EX)
        f.write(json.dumps(record, ensure_ascii=False) + '\n')
        fcntl.flock(f, fcntl.LOCK_UN)


def main():
    p = argparse.ArgumentParser()
    p.add_argument('event', choices=['start', 'end', 'note'])
    p.add_argument('--id', required=True)
    p.add_argument('--parent')
    p.add_argument('--actor')
    p.add_argument('--kind')
    p.add_argument('--label')
    p.add_argument('--status')
    p.add_argument('--detail')
    a = p.parse_args()

    record = {'event': a.event, 'id': a.id}
    for key in ('parent', 'actor', 'kind', 'label', 'status'):
        value = getattr(a, key)
        if value:
            record[key] = value
    if a.detail:
        record['detail'] = json.loads(a.detail)
    append(record)


if __name__ == '__main__':
    main()
