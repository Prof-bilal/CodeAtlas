#!/usr/bin/env bash
# Quick status of the pilot orchestrator: log tail, cells done, current cell.
ROOT="/home/abdullah/Projects/CodeAtlas/benchmarks/2026-09-fresh"
RAW="$ROOT/raw-results"
LOG=/tmp/pilot-orch.log
echo "== $(date '+%H:%M:%S') =="
echo "-- log tail --"
tail -8 "$LOG" 2>/dev/null
done_n=$(find "$RAW" -name copied 2>/dev/null | wc -l)
echo "-- cells copied: $done_n/64 --"
# Show the currently running cell (newest launched dir without a copied marker)
cur=""
cur_t=0
for d in "$RAW"/*/; do
  [ -f "$d/launched" ] || continue
  [ -f "$d/copied" ] && continue
  t=$(cat "$d/launched")
  if [ "$t" -gt "$cur_t" ]; then cur_t=$t; cur="$d"; fi
done
if [ -n "$cur" ]; then
  el=$(( ($(date +%s%N) - cur_t) / 1000000000 ))
  echo "-- running: $(basename "$cur") for ${el}s --"
  pid=$(cat "$cur/pid" 2>/dev/null)
  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then echo "   pid $pid alive"; else echo "   pid gone (check run.log)"; fi
  echo "-- run.log tail --"
  tail -3 "$cur/run.log" 2>/dev/null
fi

# Sweep: reap hung CLI processes for cells whose result is already copied.
for d in "$RAW"/*/; do
  [ -f "$d/copied" ] || continue
  pid=$(cat "$d/pid" 2>/dev/null)
  [ -n "$pid" ] || continue
  if kill -0 "$pid" 2>/dev/null; then
    kill -9 "$pid" 2>/dev/null && echo "reaped hung pid $pid ($(basename "$d"))"
  fi
done