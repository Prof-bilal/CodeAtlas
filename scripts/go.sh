#!/bin/sh
set -e
cd /home/bilal/CodeAtlas

B=/home/bilal/CodeAtlas/node_modules/.pnpm/esbuild@0.27.7/node_modules/esbuild/bin/esbuild

echo "core"
$B packages/core/src/index.ts --outdir=packages/core/dist --platform=node --format=cjs --minify=false

echo "sdk"
$B packages/sdk/src/index.ts --outdir=packages/sdk/dist --platform=node --format=cjs --minify=false

echo "mcp"
$B packages/mcp/src/index.ts --outdir=packages/mcp/dist --platform=node --format=cjs --minify=false

echo "bench"
$B packages/benchmark/src/index.ts --outdir=packages/benchmark/dist --platform=node --format=cjs --minify=false

echo "cli"
$B apps/cli/src/index.ts --outdir=apps/cli/dist --platform=node --format=cjs --minify=false

echo "done"
