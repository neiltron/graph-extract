#!/usr/bin/env python3
"""Send a prompt to a pi RPC session and wait for agent_end.

Usage: pi_ask.py <session-name> <prompt-text-or-@file> [timeout-seconds]

Prints the assistant's final text message(s) from the agent_end event.
Exits 2 on timeout (prompt may still be running - check the log later).
"""
import json
import os
import sys
import time

name = sys.argv[1]
prompt = sys.argv[2]
timeout = float(sys.argv[3]) if len(sys.argv) > 3 else 600.0
if prompt.startswith('@'):
    with open(prompt[1:]) as fh:
        prompt = fh.read()

base = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data'))
fifo = os.path.join(base, f'{name}.in')
log = os.path.join(base, f'{name}.log')


def count_agent_ends():
    n = 0
    try:
        with open(log, 'rb') as fh:
            for line in fh:
                if b'"agent_end"' in line:
                    n += 1
    except FileNotFoundError:
        pass
    return n


def last_agent_end_texts():
    ev = None
    with open(log, 'rb') as fh:
        for line in fh:
            if b'"agent_end"' in line:
                try:
                    cand = json.loads(line)
                    if cand.get('type') == 'agent_end':
                        ev = cand
                except (json.JSONDecodeError, UnicodeDecodeError):
                    pass
    if ev is None:
        return '(no agent_end event found)'
    texts = []
    for msg in ev.get('messages', []):
        if msg.get('role') != 'assistant':
            continue
        content = msg.get('content')
        parts = []
        if isinstance(content, str):
            parts.append(content)
        elif isinstance(content, list):
            for c in content:
                if isinstance(c, dict) and c.get('type') == 'text':
                    parts.append(c.get('text', ''))
        if parts:
            texts.append('\n'.join(parts))
    return '\n\n---\n\n'.join(texts) if texts else '(no assistant text in agent_end)'


before = count_agent_ends()
cmd = json.dumps({'type': 'prompt', 'message': prompt})
with open(fifo, 'w') as fh:
    fh.write(cmd + '\n')

deadline = time.time() + timeout
while time.time() < deadline:
    if count_agent_ends() > before:
        print(last_agent_end_texts())
        sys.exit(0)
    time.sleep(2)

sys.stderr.write(f'timeout after {timeout}s waiting for agent_end\n')
sys.exit(2)
