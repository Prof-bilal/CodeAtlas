const { execSync } = require('child_process');
const packages = [
  'packages/core/tsconfig.json',
  'packages/sdk/tsconfig.json',
  'packages/benchmark/tsconfig.json',
  'packages/mcp/tsconfig.json',
  'apps/cli/tsconfig.json',
];
for (const pkg of packages) {
  console.log(`Building ${pkg}...`);
  execSync(`node node_modules/.bin/tsc --build ${pkg}`, { stdio: 'inherit' });
  console.log(`Done: ${pkg}`);
}
console.log('All builds complete!');
