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

Notes from the 0.2.1 release:

- **Unclean working tree.** `pnpm publish` aborts with `ERR_PNPM_GIT_UNCLEAN`
  when the tree has uncommitted changes. If you are publishing an intentionally
  uncommitted tree (for example, a release that will be committed afterwards),
  pass `--no-git-checks` (or set `git-checks=false`). Publishing an already
  committed release needs no flag.
- **Two-factor authentication.** When the npm account has 2FA enabled, publish
  is rejected with a 403 unless you supply a valid OTP (`--otp <code>`) or an
  npm **granular access token with "Publish" permission and "Bypass 2FA"**
  enabled. The token can be passed as an inline registry auth config:
  `npm publish --access public --//registry.npmjs.org/:_authToken=<npm_...>`.
  Never commit such tokens.
- **CLI version reporting.** `atlas --version` reports the CLI's **own**
  `apps/cli/package.json` version (bundled at build time), not the root
  workspace placeholder. Bump `apps/cli/package.json` and rebuild before
  publishing, and verify with `atlas --version` from a separate directory
  afterwards.

After publication, test it from a separate directory, not from the monorepo:

```bash
mkdir codeatlas-smoke-test
cd codeatlas-smoke-test
npm install --global codeatlas-cli
atlas --version
atlas --help
atlas init --repo C:\path\to\a\real\repository
atlas search authentication --repo C:\path\to\a\real\repository
atlas explain AuthService --repo C:\path\to\a\real\repository
atlas doctor --repo C:\path\to\a\real\repository
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

## Released versions

| Version | Date | Highlights |
| ------- | ---- | ---------- |
| `0.3.0-beta.0` | 2026-08-17 | Statement-cache fix (native memory leak, peak RSS 4,274 MB → 1,698 MB on a 1000-file repo), parser reference-resolution performance/correctness, bounded search-index content, extreme benchmark suite, full npm metadata on the package. First publish after the 2026-08-16 unpublish. |
| `0.2.1` | 2026-08-14 | Deterministic context ranking (`@atlas/context`, ADR-001), `atlas explain`, `atlas doctor`, `atlas sessions stop` token-impact reporting, TUI removed from the shipped artifact. `atlas --version` reports the CLI's own version. |

Notes from the 0.3.0-beta.0 release:

- **Granular token publish.** Published with a granular access token
  (`--//registry.npmjs.org/:_authToken=<npm_...>`, "Bypass 2FA" enabled) and
  `npm publish` run from `apps/cli` — pnpm's `--filter ... publish` did **not**
  forward the inline token (ENEEDAUTH). Pre-release versions require an
  explicit `--tag beta`.
- **`--no-git-checks`.** Used because the release changes were not yet
  committed; the P0-02/03/04 changes (package.json metadata, version, CHANGELOG)
  were committed afterwards.
- **Registry processing delay.** The first publish attempt returned a 409
  (packument not fully processed); a retry ~20 s later succeeded. `npm install`
  then needed a `npm cache clean --force` because the stale packument 404'd.
- **npm auto-corrects `bin`.** npm normalized `"./dist/index.js"` to
  `"dist/index.js"` in the published manifest (a harmless auto-correction).
  Verify with `npm view codeatlas-cli@beta bin`.
