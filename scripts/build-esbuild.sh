#!/bin/sh
# Build script for CodeAtlas - uses esbuild which is a native binary
set -e
cd /home/bilal/CodeAtlas

ESBUILD=node_modules/.bin/esbuild

echo "Building packages/core..."
$ESBUILD packages/core/src/index.ts --outdir=packages/core/dist --platform=node --format=cjs --minify=false

echo "Building packages/sdk..."
$ESBUILD packages/sdk/src/index.ts --outdir=packages/sdk/dist --platform=node --format=cjs --minify=false

echo "Building packages/mcp..."
$ESBUILD packages/mcp/src/index.ts --outdir=packages/mcp/dist --platform=node --format=cjs --minify=false

echo "Building packages/benchmark..."
$ESBUILD packages/benchmark/src/index.ts --outdir=packages/benchmark/dist --platform=node --format=cjs --minify=false

echo "Building apps/cli..."
$ESBUILD apps/cli/src/index.ts --outdir=apps/cli/dist --platform=node --format=cjs --minify=false

echo "All builds complete!"
