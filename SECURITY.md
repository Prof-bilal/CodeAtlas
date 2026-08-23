# Security Policy

CodeAtlas is a developer tool that reads, indexes, and (optionally) ships
repository context to AI providers and external processes. Treat the repository
you point it at as **untrusted input**.

## Reporting a vulnerability

If you find a security issue — a provider-key leak, path traversal in the
scanner/MCP input, an unsafe process invocation, an injection risk, or a
bypass of the toolkit's security/trust gates:

- **Do not open a public issue.**
- Report it privately via
  [GitHub private vulnerability reporting](https://github.com/Prof-bilal/CodeAtlas/security/advisories/new).
- Include a minimal reproduction and the affected version if you can.

We aim to acknowledge reports promptly and to coordinate a fix before public
disclosure.

## Hard rules for code in this repository

The full policy is in [docs/SECURITY.md](docs/SECURITY.md). The non-negotiable
highlights:

- **Secrets** — never commit `.env*`; never log/print API keys or tokens; keys
  come from user environment/config, never from the analyzed repository.
- **Local first** — no implicit uploads; AI provider calls are explicit and send
  only the relevant context (see [docs/PRIVACY.md](docs/PRIVACY.md)).
- **Process execution** — `spawn(file, argsArray)`, never `shell: true` without
  a documented reason; never build a shell string from repo-derived or
  AI-generated content; timeouts on every child.
- **Malicious repositories** — repo contents must never be able to write outside
  the project, execute processes, or escalate privileges.
- **Input validation** — validate shape and bounds, then sanitize, then act
  (MCP arguments, paths, provider responses).
- **MCP exposure** — all MCP tools are read-only; any future write/exec tool
  requires explicit consent + logging.

## Supported versions

Security fixes target the current `main` branch and, once released, the latest
published CLI version.