#!/bin/bash
# Restart script for Phase B C-A work
# Run from repo root: bash benchmarks/phase-b/restart-c-a.sh
set -e
cd "$(dirname "$0")/../../.."

echo "=== Building CLI ==="
pnpm --filter @atlas/core build
pnpm --filter @atlas/benchmark build
pnpm --filter @atlas/sdk build
pnpm --filter @atlas/mcp build
pnpm --filter @atlas/cli build

echo "=== Starting axios digest re-run ==="
ATLAS_CONTEXT_MODE=digest node apps/cli/dist/index.js benchmark run oc-mimo-axios \
  --repo benchmarks/final-2026-08/repos/repo-03 --force

echo "=== Done ==="
