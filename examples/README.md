# Examples

Copy-paste examples for the current product. Every snippet uses a published
surface (`atlas`, `@prof-bilal/atlas-sdk`, `@prof-bilal/atlas-mcp`) and mirrors
the tests in `packages/sdk/tests/`.

## 1. Index a project and ask questions (CLI)

```bash
atlas init --repo /path/to/your-project        # scan → parse → index
atlas search authentication --repo /path/to/your-project
atlas context "add refresh-token rotation" --repo /path/to/your-project
```

## 2. Choose what to install (CLI)

```bash
atlas setup                                    # numbered plan; you pick, then confirm
atlas setup --tools ripgrep,semgrep --yes       # non-interactive
atlas setup --dry-run                           # plan only, nothing executed
```

## 3. Discover and inject a Skill (CLI)

```bash
atlas skills                                   # built-in + installed, with sources
atlas skills info verification-before-completion
atlas skills load systematic-debugging         # render the prompt block
atlas context launch "trace this failing test" --provider claude \
  --skill systematic-debugging
```

## 4. Read context from Node (SDK)

```ts
import { createContextSDK } from "@prof-bilal/atlas-sdk";

const context = createContextSDK({ repositoryPath: "/path/to/your-project" });

const hits = context.search.search("authentication");
const file = context.files.getFile("src/auth/session.ts"); // throws when not indexed
const signal = await context.freshness(); // fresh | stale | unknown | unavailable

console.log(hits.length, file.path, signal.state);
context.close(); // releases the SQLite handle
```

## 5. Assemble a budgeted context slice (SDK)

```ts
import { createContextIntegration, createContextSDK, createSessionManager } from "@prof-bilal/atlas-sdk";

const context = createContextSDK({ repositoryPath: "/path/to/your-project" });
const integration = createContextIntegration({
  context,
  sessions: createSessionManager(),
});

const slice = await integration.buildSlice({ task: "fix the failing auth tests" });
console.log(slice.task, slice.items.length);
```

## 6. Launch an agent session with context + a Skill (SDK)

```ts
const launched = await integration.launch({
  task: "harden the upload endpoint",
  provider: "claude",
  repositoryPath: "/path/to/your-project",
  skills: ["trail-of-bits-security-skills"],
});

if (launched.ok) console.log("session", launched.value.id);
else console.error(launched.error.message);
```

## 7. Register the MCP server (any MCP client)

```json
{
  "mcpServers": {
    "codeatlas": {
      "command": "atlas",
      "args": ["mcp", "--root", "/path/to/your-project"]
    }
  }
}
```

`atlas agents connect` writes this for installed agents automatically. The
server exposes read-only context tools plus `list_skills` / `get_skill`; see
[`docs/reference/MCP.md`](../docs/reference/MCP.md).

## 8. Plan Tool/Skill installation without installing (SDK)

```ts
import { planSetup } from "@prof-bilal/atlas-sdk";

const plan = await planSetup({ root: process.cwd() });
if (plan.ok) {
  console.log(plan.value.recommendations);      // evidence-based suggestions
  console.log(plan.value.available.map((s) => s.id)); // built-in Skills, no install needed
  console.log(plan.value.candidates.slice(0, 5));     // installable registry entries
}
```

## Contributing an example

Examples must run against the current product and must not require network
access or provider credentials. If an example needs a repository, point it at a
small fixture under `tests/fixtures/`. See [`CONTRIBUTING.md`](../CONTRIBUTING.md).
