#!/usr/bin/env python3
"""Build script that compiles TypeScript using esbuild (faster than tsc)."""
import subprocess
import sys
import os

# Find esbuild
esbuild_paths = [
    '/home/bilal/CodeAtlas/node_modules/.bin/esbuild',
    '/usr/local/bin/esbuild',
    'esbuild',
]

esbuild = None
for p in esbuild_paths:
    if os.path.exists(p) or subprocess.run(['which', p], capture_output=True).returncode == 0:
        esbuild = p
        break

if not esbuild:
    print("esbuild not found")
    sys.exit(1)

print(f"Using esbuild: {esbuild}")

# Packages to build
packages = [
    ('packages/core', 'packages/core/src/index.ts'),
    ('packages/sdk', 'packages/sdk/src/index.ts'),
    ('packages/mcp', 'packages/mcp/src/index.ts'),
    ('packages/benchmark', 'packages/benchmark/src/index.ts'),
    ('apps/cli', 'apps/cli/src/index.ts'),
]

for pkg_dir, entry in packages:
    print(f"\nBuilding {pkg_dir}...")
    result = subprocess.run(
        [esbuild, entry, '--outdir', f'{pkg_dir}/dist', '--platform=node', '--format=cjs', '--minify=false'],
        capture_output=True,
        text=True,
        cwd='/home/bilal/CodeAtlas'
    )
    if result.returncode == 0:
        print(f"  ✓ {pkg_dir}")
    else:
        print(f"  ✗ {pkg_dir}")
        print(f"  stderr: {result.stderr[:500]}")
        sys.exit(1)

print("\nAll builds complete!")
