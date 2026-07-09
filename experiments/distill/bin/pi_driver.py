#!/usr/bin/env python3
"""Long-lived pi RPC session driver.

Usage: pi_driver.py <session-name> [workdir]

Spawns `pi --mode rpc`, forwards JSONL commands from <exp>/data/<name>.in
(FIFO) to pi's stdin, and appends all pi stdout events to <exp>/data/<name>.log.
The FIFO is opened O_RDWR so writer close never delivers EOF.
Send the literal line __EXIT__ to shut down.
"""
import os
import subprocess
import sys

name = sys.argv[1]
workdir = sys.argv[2] if len(sys.argv) > 2 else os.getcwd()
base = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data'))
fifo = os.path.join(base, f'{name}.in')
log = os.path.join(base, f'{name}.log')

if not os.path.exists(fifo):
    os.mkfifo(fifo)

logf = open(log, 'ab', buffering=0)
proc = subprocess.Popen(
    ['pi', '--mode', 'rpc'],
    stdin=subprocess.PIPE,
    stdout=logf,
    stderr=logf,
    cwd=workdir,
)

fd = os.open(fifo, os.O_RDWR)
with os.fdopen(fd, 'rb') as f:
    for line in f:
        if line.strip() == b'__EXIT__':
            break
        if proc.poll() is not None:
            sys.stderr.write('pi process exited\n')
            break
        proc.stdin.write(line)
        proc.stdin.flush()

proc.terminate()
