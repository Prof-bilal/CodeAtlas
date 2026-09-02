#!/usr/bin/env node
// Sequential build script for CodeAtlas monorepo
const { execSync } = require('child_process');
const path = require('path');

const tsc = path.join(__dirname, 'node_modules', '.bin', 'tsc');
const packages = [
  'packages/core/tsconfig.json',
  'packages/sdk/tsconfig.json',
  'packages/mcp/tsconfig.json',
  'packages/benchmark/tsconfig.json',
  'apps/cli/tsconfig.json',
];

for (const pkg of packages) {
  console.log(`Building ${pkg}...`);
  try {
    execSync(`node ${tsc} --build ${pkg}`, { stdio: 'inherit' });
    console.log(`Done: ${pkg}`);
  } catch (e) {
    console.error(`Failed: ${pkg}`);
    process.exit(1);
  }
}
console.log('All builds complete!');
