#!/bin/bash
# Build all packages and run axios rep1
set -e
cd /home/bilal/CodeAtlas
echo "=== Building ==="
pnpm --filter @atlas/core build
pnpm --filter @atlas/benchmark build
pnpm --filter @atlas/sdk build
pnpm --filter @atlas/mcp build
pnpm --filter @atlas/cli build
echo "=== Build done ==="
echo "=== Running axios rep1 ==="
node apps/cli/dist/index.js benchmark run oc-mimo-axios-rep1 --repo benchmarks/final-2026-08/repos/repo-03 --force
echo "=== Rep1 done ==="
