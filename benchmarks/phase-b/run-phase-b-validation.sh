#!/usr/bin/env bash
# Phase B validation chain: strength experiment -> variance replicates -> trend re-runs.
# Runs sequentially, detached; logs inside the repo (survives /tmp cleanup).
set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CLI="$ROOT/apps/cli/dist/index.js"
REPOS="$ROOT/benchmarks/final-2026-08/repos"
LOG="$ROOT/.codeatlas/benchmarks/phase-b-validation.log"
cd "$ROOT"

run() { echo "=== [$(date -u +%H:%M:%S)] $*" >> "$LOG"; "$CLI" benchmark "$@" >> "$LOG" 2>&1; echo "=== [$(date -u +%H:%M:%S)] exit=$? $*" >> "$LOG"; }

echo "phase-b validation chain started $(date -u)" >> "$LOG"

# 1) Strength experiment: weak model (nemotron-3.5-lightning-free) on mined hard tasks
run run hard-nemotron-winston   --repo "$REPOS/repo-01"
run run hard-nemotron-commander --repo "$REPOS/repo-02"
run run hard-nemotron-axios     --repo "$REPOS/repo-03"
run run hard-nemotron-rxjs      --repo "$REPOS/repo-04"

# 2) Variance replicates: axios suite, 2 arms, 3 independent repetitions
for i in 1 2 3; do run run "oc-mimo-axios-rep$i" --repo "$REPOS/repo-03"; done

# 3) Trend confirmation: re-run remaining oc-mimo suites with the Phase B build
run run oc-mimo-winston   --repo "$REPOS/repo-01" --force
run run oc-mimo-commander --repo "$REPOS/repo-02" --force
run run oc-mimo-rxjs      --repo "$REPOS/repo-04" --force

echo "phase-b validation chain finished $(date -u)" >> "$LOG"
