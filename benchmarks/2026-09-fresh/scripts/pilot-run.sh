#!/usr/bin/env bash
# Pilot orchestrator for the 2026-09-fresh benchmark.
#
# Runs every (config, task) cell of the pilot through the REAL `atlas benchmark`
# CLI. Each cell is an opencode LLM run that takes longer than the launcher's
# inline timeout, so each is started detached (new session, disowned) and we
# poll for the persisted result JSON. Raw results are copied into
# benchmarks/2026-09-fresh/raw-results/<run-id>/ and never overwritten.
#
# Resumable: a cell already present in raw-results/ is skipped.
#
# Usage: bash scripts/pilot-run.sh
set -u

export PATH="$HOME/.local/share/mise/installs/opencode/latest:$PATH"
export PATH="$(npm config get prefix 2>/dev/null)/bin:$PATH"

CODEATLAS="/home/abdullah/Projects/CodeAtlas"
B="$CODEATLAS/benchmarks/2026-09-fresh"
CLI="$CODEATLAS/apps/cli/dist/index.js"
MODEL="opencode/mimo-v2.5-free"
RAW="$B/raw-results"
LOG="$B/pilot-run.log"
PROGRESS="$B/pilot-progress.json"
mkdir -p "$RAW"

log() { echo "[$(date +%T)] $*" | tee -a "$LOG"; }

# task -> absolute repo path (must already be indexed)
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

mode_of() { [ "$1" = "A" ] && echo baseline || echo codeatlas; }

run_cell() {
  local config="$1" task="$2"
  local repo; repo="$(repo_of "$task")"
  local mode; mode="$(mode_of "$config")"
  local suite="pilot2-$config"
  local runid="${config}-${task}"
  local out="$RAW/$runid"
  local stored="$CODEATLAS/.codeatlas/benchmarks/suites/$suite/tasks/${task}-${mode}.json"

  if [ -f "$out/copied" ]; then log "SKIP $runid (done)"; return 0; fi
  mkdir -p "$out"

  # Remove any stale result from a previous run of this exact cell so we can
  # never accept a leftover file (the source of the stale-result race).
  rm -f "$stored" "$out/result.json"

  # Launch marker: the instant we start. We only accept a result newer than this.
  date +%s%N > "$out/launched"

  log "START $runid  mode=$mode repo=$(basename "$repo")"
  setsid bash -c "cd '$CODEATLAS' && exec node '$CLI' benchmark run '$suite' --repo '$repo' --task '$task' --mode '$mode' --force > '$out/run.log' 2>&1" < /dev/null >/dev/null 2>&1 & disown
  echo $! > "$out/pid"
}

# Poll a single cell until a fresh result appears or we time out.
wait_cell() {
  local config="$1" task="$2"
  local mode; mode="$(mode_of "$config")"
  local suite="pilot2-$config"
  local runid="${config}-${task}"
  local out="$RAW/$runid"
  local stored="$CODEATLAS/.codeatlas/benchmarks/suites/$suite/tasks/${task}-${mode}.json"
  local launched; launched="$(cat "$out/launched" 2>/dev/null || echo 0)"
  local tries=0 max=120  # up to 120 * 30s = 60min per cell
  while [ $tries -lt $max ]; do
    if [ -f "$stored" ]; then
      local mtime; mtime="$(date -r "$stored" +%s%N 2>/dev/null || stat -c '%Y' "$stored" 2>/dev/null)"
      if [ "$mtime" -gt "$launched" ] 2>/dev/null; then
        cp "$stored" "$out/result.json"
        date +%s > "$out/copied"
        log "DONE   $runid"
        return 0
      fi
    fi
    sleep 30
    tries=$((tries+1))
  done
  log "TIMEOUT $runid"
  return 1
}

CONFIGS=(A B C D)
TASKS=(FRONTEND-MEDIUM-01 FRONTEND-HARD-01 BACKEND-EASY-01 BACKEND-MEDIUM-01 \
        DEBUGGING-HARD-01 DEBUGGING-EXPERT-01 FULLSTACK-MEDIUM-01 FULLSTACK-EXPERT-01 \
        REFACTORING-MEDIUM-01 REFACTORING-HARD-01 TESTING-MEDIUM-01 TESTING-HARD-01 \
        EXT-HARD-01 EXT-EXPERT-01 ARCH-EASY-01 ARCH-MEDIUM-01)

log "=== pilot run begin ==="
for c in "${CONFIGS[@]}"; do
  for t in "${TASKS[@]}"; do
    run_cell "$c" "$t" || { log "LAUNCH FAIL $c-$t"; continue; }
    wait_cell "$c" "$t" || log "WAIT FAIL $c-$t"
  done
done
log "=== pilot run end ==="