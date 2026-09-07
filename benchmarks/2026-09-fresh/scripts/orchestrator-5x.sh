#!/usr/bin/env bash
# orchestrator-5x.sh — Full 5x matrix orchestrator for 2026-09-fresh benchmark.
#
# Runs every (config, task) cell of the fresh5 suites through the real
# `atlas benchmark` CLI with runsPerTask=5. Each cell is an opencode LLM run
# that takes longer than the launcher's inline timeout, so each is started
# detached (new session, disowned) and we poll for process exit. Raw results
# (run1..run5) are copied into raw-results-5x/<CONFIG>-<TASK>/ and never
# overwritten.
#
# Resumable: a cell with all 5 run files present is skipped.
#
# Usage: bash scripts/orchestrator-5x.sh
set -u

export PATH="$HOME/.local/share/mise/installs/opencode/latest:$PATH"
export PATH="$(npm config get prefix 2>/dev/null)/bin:$PATH"

CODEATLAS="/home/abdullah/Projects/CodeAtlas"
B="$CODEATLAS/benchmarks/2026-09-fresh"
CLI="$CODEATLAS/apps/cli/dist/index.js"
MODEL="opencode/mimo-v2.5-free"
RAW="$B/raw-results-5x"
LOG="$B/orchestrator-5x.log"
SUITES="$CODEATLAS/.codeatlas/benchmarks/suites"
mkdir -p "$RAW"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG"; }

# Task -> absolute repo path (must already be indexed)
repo_of() {
  case "$1" in
    FRONTEND-MEDIUM-01)        echo "$CODEATLAS" ;;
    FRONTEND-HARD-01)          echo "$B/repos/frontend-fixture" ;;
    BACKEND-EASY-01|BACKEND-MEDIUM-01|REFACTORING-MEDIUM-01|REFACTORING-HARD-01|TESTING-MEDIUM-01)
                               echo "$B/repos/01-small-app" ;;
    DEBUGGING-HARD-01)         echo "$B/repos/01-small-app-debug1" ;;
    DEBUGGING-EXPERT-01)       echo "$B/repos/01-small-app-debug2" ;;
    FULLSTACK-MEDIUM-01|FULLSTACK-EXPERT-01|EXT-HARD-01|EXT-EXPERT-01|ARCH-EASY-01|ARCH-MEDIUM-01)
                               echo "$CODEATLAS" ;;
    TESTING-HARD-01)           echo "$B/repos/01-small-app-testing1" ;;
    *) echo "UNKNOWN";;
  esac
}

# Suite and mode for each config
suite_of() {
  case "$1" in
    A) echo "fresh5-A" ;;
    B) echo "fresh5-B" ;;
    C) echo "fresh5-C" ;;
    D) echo "fresh5-D" ;;
  esac
}
mode_of() { [ "$1" = "A" ] && echo baseline || echo codeatlas; }

# Check if a cell is already complete: all 5 run files + copied marker
is_done() {
  local config="$1" task="$2"
  local out="$RAW/$config-$task"
  [ -f "$out/copied" ] && return 0
  local mode; mode="$(mode_of "$config")"
  for n in 1 2 3 4 5; do
    [ ! -f "$out/run${n}.json" ] && return 1
  done
  return 0
}

# Launch a single cell (one CLI invocation runs 5 tasks internally)
launch_cell() {
  local config="$1" task="$2"
  local repo; repo="$(repo_of "$task")"
  local mode; mode="$(mode_of "$config")"
  local suite; suite="$(suite_of "$config")"
  local out="$RAW/$config-$task"

  if is_done "$config" "$task"; then
    log "SKIP $config-$task (done)"
    return 0
  fi

  mkdir -p "$out"
  rm -f "$out/copied"

  # Launch marker
  date +%s%N > "$out/launched"

  log "START $config-$task  mode=$mode repo=$(basename "$repo") suite=$suite"
  setsid bash -c "cd '$CODEATLAS' && exec node '$CLI' benchmark run '$suite' --repo '$repo' --task '$task' --mode '$mode' > '$out/run.log' 2>&1" < /dev/null >/dev/null 2>&1 & disown
  echo $! > "$out/pid"
}

# Wait for a cell to finish (process exit) and copy results
wait_cell() {
  local config="$1" task="$2"
  local mode; mode="$(mode_of "$config")"
  local suite; suite="$(suite_of "$config")"
  local out="$RAW/$config-$task"
  local pid; pid="$(cat "$out/pid" 2>/dev/null || echo "")"
  local store="$SUITES/$suite/tasks"
  local tries=0 max=240  # up to 240 * 30s = 2h per cell (5 runs × 20min timeout max)

  if [ -z "$pid" ]; then
    log "NO-PID $config-$task"
    return 1
  fi

  while [ $tries -lt $max ]; do
    if ! kill -0 "$pid" 2>/dev/null; then
      # Process exited — copy results
      sleep 2  # brief settle for file writes
      local copied=0
      for n in 1 2 3 4 5; do
        local src="$store/${task}#run${n}-${mode}.json"
        if [ -f "$src" ]; then
          cp "$src" "$out/run${n}.json"
          copied=$((copied+1))
        fi
      done
      # Also copy the base key (last run) as run5 reference
      local base="$store/${task}-${mode}.json"
      if [ -f "$base" ]; then
        cp "$base" "$out/base.json"
      fi
      if [ "$copied" -ge 1 ]; then
        date +%s > "$out/copied"
        log "DONE   $config-$task (${copied}/5 runs)"
        return 0
      else
        log "FAIL   $config-$task (no results, process exited)"
        return 1
      fi
    fi
    sleep 30
    tries=$((tries+1))
  done
  log "TIMEOUT $config-$task (2h exceeded)"
  return 1
}

# --- Main ---
CONFIGS=(A B C D)
TASKS=(FRONTEND-MEDIUM-01 FRONTEND-HARD-01 BACKEND-EASY-01 BACKEND-MEDIUM-01 \
        DEBUGGING-HARD-01 DEBUGGING-EXPERT-01 FULLSTACK-MEDIUM-01 FULLSTACK-EXPERT-01 \
        REFACTORING-MEDIUM-01 REFACTORING-HARD-01 TESTING-MEDIUM-01 TESTING-HARD-01 \
        EXT-HARD-01 EXT-EXPERT-01 ARCH-EASY-01 ARCH-MEDIUM-01)

TOTAL=$(( ${#CONFIGS[@]} * ${#TASKS[@]} ))
DONE=0
FAILED=0

log "=== 5x full matrix begin === ($TOTAL cells, 5 runs each)"
log "Suites: fresh5-A/B/C/D (runsPerTask=5, taskTimeoutMs=1200000)"
log "Model: $MODEL"

for c in "${CONFIGS[@]}"; do
  for t in "${TASKS[@]}"; do
    DONE=$((DONE+1))
    log "[$DONE/$TOTAL] $c-$t"
    launch_cell "$c" "$t" || { FAILED=$((FAILED+1)); continue; }
    wait_cell "$c" "$t" || FAILED=$((FAILED+1))
  done
done

log "=== 5x full matrix end === ($DONE/$TOTAL attempted, $FAILED failed)"
