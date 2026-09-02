#!/bin/sh
# Standalone build script for CodeAtlas
# Uses esbuild native binary directly
set -e
cd /home/bilal/CodeAtlas

ESB=/home/bilal/CodeAtlas/node_modules/.pnpm/esbuild@0.27.7/node_modules/esbuild/bin/esbuild

echo "Building core..."
$ESB packages/core/src/index.ts --outdir=packages/core/dist --platform=node --format=cjs --minify=false

echo "Building sdk..."
$ESB packages/sdk/src/index.ts --outdir=packages/sdk/dist --platform=node --format=cjs --minify=false

echo "Building mcp..."
$ESB packages/mcp/src/index.ts --outdir=packages/mcp/dist --platform=node --format=cjs --minify=false

echo "Building benchmark..."
$ESB packages/benchmark/src/index.ts --outdir=packages/benchmark/dist --platform=node --format=cjs --minify=false

echo "Building CLI..."
$ESB apps/cli/src/index.ts --outdir=apps/cli/dist --platform=node --format=cjs --minify=false

echo "All builds complete!"
