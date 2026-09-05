#!/usr/bin/env bash
# pilot-watchdog.sh — reap hung cell CLI processes while the pilot runs.
# A cell process is "hung" when its cell dir has a `copied` marker (result
# already accepted) but the CLI process is still alive. Kill it so memory
# doesn't accumulate over a long unattended run. Safe to run alongside the
# orchestrator: it only touches PIDs recorded in per-cell `pid` files whose
# result is already copied, and only after the process has been alive for
# at least 120s past the copy.
ROOT="/home/abdullah/Projects/CodeAtlas/benchmarks/2026-09-fresh"
RAW="$ROOT/raw-results"
LOG=/tmp/pilot-watchdog.log
while true; do
  for d in "$RAW"/*/; do
    [ -f "$d/copied" ] || continue
    pid=$(cat "$d/pid" 2>/dev/null)
    [ -n "$pid" ] || continue
    if kill -0 "$pid" 2>/dev/null; then
      # Only reap if the copied marker is at least 120s old.
      c=$(stat -c %Y "$d/copied" 2>/dev/null) || continue
      now=$(date +%s)
      if [ $((now - c)) -ge 120 ]; then
        if kill -9 "$pid" 2>/dev/null; then
          echo "[$(date '+%H:%M:%S')] reaped hung pid $pid ($(basename "$d"))" >> "$LOG"
        fi
      fi
    fi
  done
  sleep 300
done