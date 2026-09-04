#!/usr/bin/env bash
# Self-resuming watchdog: if the validation chain ever dies (e.g. a machine
# suspend), relaunch it. Detached; logs to the phase-b watch log.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LOG="$ROOT/.codeatlas/benchmarks/watchdog.log"
CHAIN="$ROOT/benchmarks/phase-b/run-phase-b-validation.sh"
while true; do
  if ! pgrep -f 'run-phase-b-validation.sh' >/dev/null && ! pgrep -f 'dist/index.js benchmark run' >/dev/null; then
    echo "$(date -u +%H:%M:%S) chain not running — relaunching" >> "$LOG"
    setsid bash "$CHAIN" < /dev/null > /dev/null 2>&1 &
  fi
  sleep 120
done