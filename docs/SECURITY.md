# CodeAtlas Security Policy

Hard rules for anyone (human or AI agent) writing code in this repository.
Treat these as non-negotiable.

---

## 1. Secrets & credentials

**Never:**

- commit secrets (`.env*` is gitignored — keep it that way),
- log API keys, tokens, or authorization headers,
- print provider config values in errors or `--debug` output,
- expose environment variables in CLI help, errors, or diagnostics,
- hard-code keys as defaults or fallbacks,
- read keys from files inside the *target repository* being analyzed (a
  malicious repo could plant a `.env` to be exfiltrated — keys come from **user
  config**, never repo contents, unless the user explicitly opts in).

**Do:**

- strip secrets from any error/response before surfacing,
- allow keys via environment variables or user config files, redacting on
  display (`atlas config` shows `****`).

---

## 2. Source code privacy

- **Never upload source code silently.** The default is Local First
  ([PRIVACY.md](./PRIVACY.md)). Uploads (e.g. an AI provider call) require an
  explicitly configured provider and send only the **relevant context**, not the
  whole repository — unless the user explicitly approves a full upload.
- A provider call is a deliberate, user-configured action — never implicit.

---

## 3. Command execution (child processes)

This is the highest-risk area (relevant to the planned Agent Orchestrator and to
`collectGitInfo` which already runs `git` via `execFile`).

**Rules:**

- Prefer `spawn(file, argsArray)` over `spawn(..., { shell: true })` /
  `exec(shellString)`. Pass arguments as an **array**; let Node handle quoting.
  `execFile` is acceptable for a fixed binary with a literal arg list (as
  `manifest.ts` does for `git` with a timeout) — never build a shell string from
  untrusted input.
- **Never** pass repository-derived content or AI-generated output into a shell
  string.
- **Never execute AI-generated shell commands automatically.** AI output is data
  until a human (or an explicitly enabled, sandboxed executor) runs it.
- Validate the binary: only known agent names for the orchestrator; resolve via
  the user's PATH/config, not from repo-controlled files (a malicious repo could
  plant a script named `claude`).
- Set timeouts on every child; kill on timeout; report partial output honestly.
- Sanitize and truncate child stderr/stdout before logging (may contain keys or
  repo data).

---

## 4. Path traversal, symlinks & malicious repositories

- **Path traversal:** any path derived from repo contents or user input must be
  validated/resolved before touching the file system. Never join untrusted
  segments into filesystem paths without normalization, and never follow a
  path outside the intended root.
- **Symlinks:** be wary of scanning/parsing directories containing symlinks to
  sensitive locations (`/etc`, user home, other repos). Prefer default-ignoring
  symlinked dirs, or resolve + verify the real path stays under the project root.
- **Malicious repositories:** a project is **untrusted input** (a supply-chain
  attacker could craft it). Therefore:
  - repo contents must not be able to write outside the project (`.codeatlas/`
    lives inside it),
  - repo contents must not be able to cause arbitrary process execution,
  - `.gitignore`/ignore-file parsing must not allow config that escalates
    privileges.
- Avoid `git` calls against repo-planted config unless the invocation is
  carefully fixed (`--no-optional-locks`, `-c` overrides as needed) and bounded.

---

## 5. External input validation

Treat all of the following as untrusted until validated:

- repository file paths & contents (scanned),
- `.gitignore` / ignore patterns,
- MCP tool arguments — MCP requests are external input; the SDK's zod schemas
  and the server's validation layer reject unexpected shapes, and `limit` /
  `target` / `node` arguments are bounded (see `docs/MCP.md`),
- external CLI arguments for the orchestrator (future),
- provider responses (they are model output — parse defensively, never eval).

**General rule:** *validate shape and bounds, then sanitize, then act.*
Belt-and-braces on anything that touches a shell, a path, or the network.

---

## 6. MCP exposure

`@atlas/mcp` exposes *context* to external agents over stdio (see `docs/MCP.md`):

- All seven tools are **read-only** today: they query the persisted index
  (`search_*`, `get_dependencies`, `explain_module`, `project_overview`,
  `read_file_range`) or
  read a stored summary. None mutate the analyzed repo or execute commands.
  `get_summary ... generate: true` is the only path that reaches an AI provider,
  and only when one is configured — it sends the relevant file content, not the
  whole repo (see `docs/PRIVACY.md`).
- Any future write/exec tool must be added with explicit consent + logging.
- The server serves project context only to whatever local process launched it;
  it is bound to that process's stdio and exposes no network endpoint.

---

## 7. Error handling hygiene

- Errors must not reveal: keys, absolute paths containing user names (redact
  home), env values, or provider secrets.
- Fail loudly on misuse, fail gracefully on genuine I/O; never continue with
  partial secrets in memory longer than needed.

---

## 8. Review checklist (use on every PR)

- [ ] No secrets/keys in code, tests, or fixtures.
- [ ] No `shell: true` on untrusted input; args passed as arrays.
- [ ] No path built from untrusted input without validation.
- [ ] Symlink handling verified.
- [ ] Error messages/help/logs leak no env or keys.
- [ ] `.env*` and `.codeatlas/` stay gitignored.
- [ ] No implicit upload of repo content to a remote.