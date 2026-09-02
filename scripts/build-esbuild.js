#!/usr/bin/env node
// Build script using esbuild module API
const esbuild = require('/home/bilal/CodeAtlas/node_modules/esbuild');

async function build() {
  const packages = [
    ['packages/core/src/index.ts', 'packages/core/dist'],
    ['packages/sdk/src/index.ts', 'packages/sdk/dist'],
    ['packages/mcp/src/index.ts', 'packages/mcp/dist'],
    ['packages/benchmark/src/index.ts', 'packages/benchmark/dist'],
    ['apps/cli/src/index.ts', 'apps/cli/dist'],
  ];

  for (const [entry, outdir] of packages) {
    console.log(`Building ${entry}...`);
    await esbuild.build({
      entryPoints: [entry],
      outdir,
      platform: 'node',
      format: 'cjs',
      minify: false,
      bundle: true,
    });
    console.log(`  ✓ ${outdir}`);
  }

  console.log('All builds complete!');
}

build().catch(err => {
  console.error('Build failed:', err);
  process.exit(1);
});
