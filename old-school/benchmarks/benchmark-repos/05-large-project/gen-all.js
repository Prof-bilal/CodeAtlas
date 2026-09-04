// gen-all.js - Main orchestrator
const fs = require('fs');
const path = require('path');
const { write } = require('./gen-modules/utils');

const BASE = __dirname;

// Root files
const pkgJson = {
  name: 'mega-platform',
  version: '3.0.0',
  private: true,
  description: 'Large-scale enterprise platform for benchmarking CodeAtlas',
  scripts: {
    build: 'turbo build',
    dev: 'turbo dev',
    test: 'turbo test',
    lint: 'turbo lint',
    typecheck: 'turbo typecheck',
    format: 'prettier --write "**/*.{ts,tsx,json,md}"',
    'db:migrate': 'ts-node packages/database/src/cli.ts migrate',
    'db:seed': 'ts-node packages/database/src/cli.ts seed',
  },
  dependencies: {
    '@atlas/core': 'workspace:*',
    '@atlas/auth': 'workspace:*',
    '@atlas/database': 'workspace:*',
    '@atlas/payments': 'workspace:*',
    '@atlas/notifications': 'workspace:*',
    '@atlas/analytics': 'workspace:*',
    '@atlas/search': 'workspace:*',
    '@atlas/storage': 'workspace:*',
    '@atlas/ui': 'workspace:*',
    '@atlas/shared': 'workspace:*',
  },
  devDependencies: {
    typescript: '^5.3.0',
    vitest: '^1.0.0',
    prettier: '^3.0.0',
    eslint: '^8.50.0',
    turbo: '^1.10.0',
  },
};

write(path.join(BASE, 'package.json'), JSON.stringify(pkgJson, null, 2));
write(path.join(BASE, 'tsconfig.json'), JSON.stringify({
  compilerOptions: {
    target: 'ES2022',
    module: 'NodeNext',
    moduleResolution: 'NodeNext',
    lib: ['ES2022'],
    strict: true,
    esModuleInterop: true,
    skipLibCheck: true,
    forceConsistentCasingInFileNames: true,
    resolveJsonModule: true,
    declaration: true,
    declarationMap: true,
    sourceMap: true,
    outDir: './dist',
    rootDir: '.',
    experimentalDecorators: true,
    emitDecoratorMetadata: true,
  },
  exclude: ['node_modules', 'dist'],
}, null, 2));

console.log('Root files created');

// Run all generators
let totalFiles = 0;

try {
  const { genShared } = require('./gen-modules/packages-shared.js');
  const n = genShared(BASE);
  console.log('Shared: ' + n);
  totalFiles += n;
} catch (e) { console.error('Shared failed:', e.message); }

try {
  const { genTypes } = require('./gen-modules/packages-types.js');
  const n = genTypes(BASE);
  console.log('Types: ' + n);
  totalFiles += n;
} catch (e) { console.error('Types failed:', e.message); }

try {
  require('./gen-core.js');
} catch (e) { console.error('Core failed:', e.message); }

try {
  require('./gen-auth.js');
} catch (e) { console.error('Auth failed:', e.message); }

try {
  require('./gen-database.js');
} catch (e) { console.error('Database failed:', e.message); }

try {
  require('./gen-apps.js');
} catch (e) { console.error('Apps failed:', e.message); }

try {
  require('./gen-packages.js');
} catch (e) { console.error('Packages failed:', e.message); }

try {
  require('./gen-support.js');
} catch (e) { console.error('Support failed:', e.message); }

console.log('\nGeneration complete!');
