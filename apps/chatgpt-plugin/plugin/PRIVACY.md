# CodeAtlas plugin — privacy

CodeAtlas is **local-first**. The plugin does not send your source code to any
CodeAtlas service, because there is no CodeAtlas service: everything runs on the
host that runs the MCP server.

## What the plugin reads

- A repository that has already been indexed by CodeAtlas (`.codeatlas/context.db`),
  reached only through the CodeAtlas Context SDK.
- Nothing else. There is no arbitrary filesystem access: file reads are limited
  to files present in the index and are filtered by CodeAtlas's secret deny-list
  (`.env*`, private keys, `secrets*.json`, credential files).

## What leaves the machine

- When the plugin runs over **stdio** (Codex CLI and other local clients),
  nothing leaves the machine except what the client itself transmits.
- When the plugin runs over **HTTP** (a ChatGPT connector), the MCP tool
  requests and responses travel between ChatGPT and the server URL you
  configure. The responses contain indexed repository context (paths, symbols,
  dependency edges, and requested code ranges) — never `.env` files, keys, or
  credentials. If you expose the HTTP server beyond loopback, always set a
  bearer token and use HTTPS.

## What is never exposed

- Environment secrets, API keys, tokens, private keys, or unrelated filesystem
  contents.
- Any file matched by the CodeAtlas deny-list, regardless of whether it is in
  the index.

## Data retention

The plugin keeps no analytics and stores nothing beyond the CodeAtlas index and
the host operating system's normal process memory. The CodeAtlas index lives in
your repository's `.codeatlas/` directory and is yours to delete.
