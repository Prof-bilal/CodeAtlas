#!/usr/bin/env bash
# monitor-5x.sh — Quick status of the 5x full matrix orchestrator.
#
# Usage: bash scripts/monitor-5x.sh
set -u

B="/home/abdullah/Projects/CodeAtlas/benchmarks/2026-09-fresh"
RAW="$B/raw-results-5x"
LOG="$B/orchestrator-5x.log"

echo "== $(date '+%Y-%m-%d %H:%M:%S') =="

# Orchestrator status
if ps aux | grep -q "[o]rchestrator-5x.sh"; then
  echo "Orchestrator: RUNNING"
else
  echo "Orchestrator: STOPPED"
fi

# Active opencode
OPCODE_PID=$(ps aux | grep "[o]pencode run" | grep -v grep | awk '{print $2}' | head -1)
if [ -n "$OPCODE_PID" ]; then
  echo "Opencode:     RUNNING (PID $OPCODE_PID)"
else
  echo "Opencode:     IDLE"
fi

# Count completed cells
DONE=0
TOTAL=64
ACTIVE=""
for d in "$RAW"/*/; do
  [ -d "$d" ] || continue
  name=$(basename "$d")
  if [ -f "$d/copied" ]; then
    DONE=$((DONE+1))
  elif [ -f "$d/launched" ]; then
    ACTIVE="$name"
  fi
done
echo "Progress:     $DONE/$TOTAL cells complete"
[ -n "$ACTIVE" ] && echo "Currently:    $ACTIVE"

# Count runs per config
echo ""
echo "Per-config runs:"
for c in A B C D; do
  runs=$(find "$RAW" -path "$RAW/$c-*/run[1-5].json" 2>/dev/null | wc -l)
  cells=$(find "$RAW" -path "$RAW/$c-*/copied" 2>/dev/null | wc -l)
  echo "  Config $c: $runs/80 runs, $cells/16 cells"
done

# Log tail
echo ""
echo "-- last 10 lines --"
tail -10 "$LOG" 2>/dev/null
