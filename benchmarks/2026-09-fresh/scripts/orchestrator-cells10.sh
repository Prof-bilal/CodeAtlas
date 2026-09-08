#!/usr/bin/env bash
# orchestrator-cells10.sh — 10-cell benchmark orchestrator for 2026-09-fresh.
#
# Runs the 5 curated tasks through Config A (baseline) and Config B (codeatlas),
# one run each = 10 cells, via the `atlas benchmark` CLI. Each cell is an
# opencode LLM run that outlives the launcher's inline timeout, so each is
# started detached (new session, disowned) and we poll for process exit. Raw
# results are copied into raw-results/<CONFIG>-<TASK>/ and never overwritten.
#
# Resumable: a cell with a `copied` marker is skipped.
#
# Usage: bash scripts/orchestrator-cells10.sh
set -u

export PATH="$HOME/.local/share/mise/installs/opencode/latest:$PATH"
export PATH="$(npm config get prefix 2>/dev/null)/bin:$PATH"

CODEATLAS="/home/abdullah/Projects/CodeAtlas"
B="$CODEATLAS/benchmarks/2026-09-fresh"
CLI="$CODEATLAS/apps/cli/dist/index.js"
MODEL="opencode/mimo-v2.5-free"
RAW="$B/raw-results"
LOG="$B/orchestrator-cells10.log"
SUITES="$CODEATLAS/.codeatlas/benchmarks/suites"
mkdir -p "$RAW"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG"; }

# Task -> absolute repo path (must already be indexed)
repo_of() {
  case "$1" in
    BACKEND-EASY-01|TESTING-MEDIUM-01|REFACTORING-MEDIUM-01)
                         echo "$B/repos/01-small-app" ;;
    ARCH-EASY-01|FRONTEND-MEDIUM-01)
                         echo "$CODEATLAS" ;;
    *) echo "UNKNOWN";;
  esac
}

# Check if a cell is already complete
is_done() {
  [ -f "$RAW/$1-$2/copied" ]
}

# Launch a single cell
launch_cell() {
  local config="$1" task="$2"
  local repo; repo="$(repo_of "$task")"
  local mode="$([ "$config" = "A" ] && echo baseline || echo codeatlas)"
  local suite="cells10-$config"
  local out="$RAW/$config-$task"

  if is_done "$config" "$task"; then
    log "SKIP $config-$task (done)"
    return 0
  fi

  mkdir -p "$out"
  rm -f "$out/copied"
  date +%s%N > "$out/launched"

  log "START $config-$task  mode=$mode repo=$(basename "$repo") suite=$suite"
  setsid bash -c "cd '$CODEATLAS' && exec node '$CLI' benchmark run '$suite' --repo '$repo' --task '$task' --mode '$mode' --force > '$out/run.log' 2>&1" < /dev/null >/dev/null 2>&1 & disown
  echo $! > "$out/pid"
}

# Wait for a cell to finish (process exit) and copy results
wait_cell() {
  local config="$1" task="$2"
  local mode="$([ "$config" = "A" ] && echo baseline || echo codeatlas)"
  local suite="cells10-$config"
  local out="$RAW/$config-$task"
  local pid; pid="$(cat "$out/pid" 2>/dev/null || echo "")"
  local store="$SUITES/$suite/tasks"
  local tries=0 max=180  # up to 180 * 30s = 90min per cell

  if [ -z "$pid" ]; then
    log "NO-PID $config-$task"
    return 1
  fi

  while [ $tries -lt $max ]; do
    if ! kill -0 "$pid" 2>/dev/null; then
      sleep 2  # brief settle for file writes
      local src="$store/${task}-${mode}.json"
      if [ -f "$src" ]; then
        cp "$src" "$out/result.json"
        date +%s > "$out/copied"
        log "DONE   $config-$task (result copied)"
        return 0
      fi
      log "FAIL   $config-$task (process exited, no result)"
      return 1
    fi
    sleep 30
    tries=$((tries+1))
  done
  log "TIMEOUT $config-$task (90min exceeded)"
  return 1
}

# --- Main ---
CONFIGS=(A B)
TASKS=(BACKEND-EASY-01 ARCH-EASY-01 FRONTEND-MEDIUM-01 TESTING-MEDIUM-01 REFACTORING-MEDIUM-01)
TOTAL=$(( ${#CONFIGS[@]} * ${#TASKS[@]} ))
DONE=0

log "=== 10-cell matrix begin === ($TOTAL cells, 1 run each)"
log "Suites: cells10-A/B (runsPerTask=1, taskTimeoutMs=840000)"
log "Model: $MODEL"

for c in "${CONFIGS[@]}"; do
  for t in "${TASKS[@]}"; do
    DONE=$((DONE+1))
    log "[$DONE/$TOTAL] $c-$t"
    launch_cell "$c" "$t" || continue
    wait_cell "$c" "$t" || true
  done
done

log "=== 10-cell matrix end === ($DONE/$TOTAL attempted)"