# Publishing CodeAtlas

The end-user CLI is published as **`codeatlas-cli`** (package name in
`apps/cli/package.json`), exposing the `atlas` binary. Its build bundles the
internal `@atlas/*` workspace packages, so normal users do not need the monorepo
or separately published implementation packages.

The original `@atlas/cli` name is not available: the `@atlas` npm scope is
already owned by another user, so the CLI is published under the unscoped name
`codeatlas-cli`. Keep this name unless the scope situation changes.

## Prerequisites

- An npm account that can publish unscoped packages (any account) and is logged
  in (`npm login`).
- Node.js 22.5 or newer.
- pnpm 9.15.0, enabled through Corepack.
- A clean, reviewed working tree and npm authentication.

## Release checklist

From the repository root:

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm check
pnpm build
pnpm --filter codeatlas-cli exec pnpm pack --pack-destination .release
```

`pnpm pack` does not accept `--filter` directly, so the pack is run inside the
package directory via `exec`. Inspect the generated tarball in `.release`. It
should contain the CLI `dist` output and package metadata, and must not contain
the repository, `.env` files, credentials, `.codeatlas` data, or source
databases.

Log in to npm and verify the package name/version:

```bash
npm login
npm view codeatlas-cli version
```

Publish the package:

```bash
pnpm --filter codeatlas-cli publish --access public
```

The root shortcut builds and publishes the CLI:

```bash
pnpm release:cli
```

After publication, test it from a separate directory, not from the monorepo:

```bash
mkdir codeatlas-smoke-test
cd codeatlas-smoke-test
npm install --global codeatlas-cli
atlas --help
atlas init --repo C:\path\to\a\real\repository
atlas search authentication --repo C:\path\to\a\real\repository
```

## Versioning

Update `apps/cli/package.json` before each release. npm does not allow
overwriting an existing version. Use semantic versions: `0.1.x` for MVP fixes,
`0.2.0` for backwards-compatible CLI features, and `1.0.0` when the CLI
contract is stable.

Do not publish the private root package. The internal SDK and feature packages
remain workspace implementation details unless a separate public SDK release
is deliberately designed and documented.

## Automated publishing later

CI publishing should be added only after the manual smoke test is reliable. It
should publish from a reviewed release tag, use npm trusted publishing or an
organization-managed token, run `pnpm check` first, and never store npm
credentials in the repository.
