# CodeAtlas walkthrough narration

## 00:00 Your AI knows the prompt. Does it know the project?

An AI coding tool can answer a prompt and still miss the project. It may reread the same files, overlook dependencies, or propose a change without understanding its impact. CodeAtlas gives your tools a reusable map of the repository, then selects context for the task. This walkthrough shows what works today and where the beta still needs attention.

## 00:21 One repository. Reusable context.

CodeAtlas scans source files, hashes them, extracts symbols, builds relationships, and stores the index locally. Search and context selection are deterministic. An AI provider is optional for summaries and briefings. Today the strongest parsing support is TypeScript and JavaScript. Treat other languages and unresolved import aliases as limitations, rather than assuming full code intelligence.

## 00:46 Start with the runtime

Use Node twenty two point five or newer because storage uses the built in SQLite module. Install codeatlas cli, check the version, and read help. Installation gives you CodeAtlas. It does not silently install coding agents or toolkit tools. This video follows the local zero point five point one source; confirm the installed version when following along.

## 01:09 Scan before you index

Enter your project and run atlas scan for a metadata overview. Scan reports files, languages, and framework evidence without building the context database. Run atlas init to index the project. Tools none skips the optional post initialization offer. These commands use the SDK pipeline, and generated project state lives inside the local codeatlas directory.

## 01:32 Build once. Update changes.

Atlas build rebuilds context. After source changes, use atlas update so unchanged files can reuse their stored information. A no change update avoids reparsing. Summaries is a separate opt in flag that requests provider backed enrichment; configure a provider first. Basic indexing and search do not need a provider, and failed summary requests are reported separately.

## 01:56 Search with evidence

Search accepts query words and returns ranked indexed results. Limit controls the result count, type narrows the kind, and no fuzzy disables typo tolerance. JSON makes results easy to script. Explain resolves a file, symbol, module, or concept against the index. AI summaries require the explicit AI flag; ordinary explanations use local evidence.

## 02:20 Ask for the relevant slice

Atlas ask returns a ranked context slice for a question. It is not a general chat answer from a model. Set max tokens to bound the estimated context size, save to persist the slice, and plan to include task classification and a deterministic plan. Read the evidence before giving it to your coding agent.

## 02:40 Choose the context budget

Context build assembles a task specific package with selection reasons and an estimated token budget. Explain shows why items were selected. Context mode chooses automatic, digest, full, or disabled assembly, with an automatic escalation option as well. Include instructions and overview flags tune the package. The AI flag adds an optional provider backed briefing.

## 03:04 Export to your own agent

Export writes a self contained markdown slice for your agent. Choose Claude, Gemini, Codex, OpenCode, or generic. Use no inject when you only want the export file. Otherwise an agent instruction file can receive a marked block, with a backup on first injection. Review both the slice and the target instruction file before using the result.

## 03:26 Connect the context tools

Agents status shows MCP registration status for supported coding tools. Connect can register the context server for an installed target; dry run previews the configuration changes. Atlas MCP serves context over standard input and output, so your client normally launches it. That gives the coding agent access to indexed context tools while preserving the SDK boundary.

## 03:50 Launch with a grounded task

The four agent commands wrap context launch with a provider selection. OpenCode, Claude, Gemini, and Codex must be installed and configured independently. You can add a skill and an estimated context budget. The present launch path does not provide a reliable visible transcript for external CLIs, so test the handoff before relying on it in daily work.

## 04:12 OpenCode runs on a small fixture

Here is a real run of the installed OpenCode CLI on the tiny authentication example. The configured default provider failed because its account had insufficient funds. An explicit Big Pickle model run succeeded. Its actual response explains authenticate and login. This is a direct OpenCode demonstration; the Atlas launcher still needs visible output handoff before it can provide the same experience.

## 04:36 Know the session boundary

Sessions exposes list, info, and stop. However, the current manager keeps sessions in memory. A separate CLI invocation creates a fresh manager and cannot recover the session you just launched. Context attach is limited to a created session. These APIs are useful within a shared SDK manager, but persistent command line session management needs further work.

## 05:00 Optional AI enrichment

Providers reports which AI providers are configured without printing keys. Ollama offers status, connect, models, use, and disconnect for a local or configured remote service. Pick a model your server actually exposes. AI summaries and briefings are explicit choices. Keep keys in user configuration or the environment, and avoid placing real credentials in tutorial commands.

## 05:25 Read measurements honestly

Usage summary, list, and budgets report recorded AI activity. Values can be actual, estimated, or unknown; unknown is not zero. External CLI token usage is often unavailable. Metrics show reports local activity and estimated context compression. Export writes JSON or CSV, and reset requires yes. Estimated savings are a heuristic baseline, not a measured performance guarantee.

## 05:51 Discover before you install

Tools lists the toolkit overview, categories groups the catalog, search finds entries, and info shows declared metadata and installed state. Setup detects project evidence and proposes a selection. Dry run previews the plan. Nothing should install just because it is recommended. Review compatibility, trust, the official distribution channel, and the exact command before approving a tool.

## 06:16 Manage a selected tool

Install requires explicit approval with yes. Configure previews supported host configuration changes with dry run. Tools doctor checks installed manifests and integration state. Update can approve an ecosystem refresh, and remove delegates removal to the appropriate ecosystem. These are real machine changes, so inspect the selected tool and its declared requirements before running the commands.

## 06:41 Extend the same registry

Custom tools use the existing schema and local overlay. Validate checks a JSON definition before writing it. Add persists a valid record, and create builds one from command flags and install metadata. Read create help for the full required shape, including official package and repository information where applicable. Replace must be explicit when overriding an existing record.

## 07:04 Reusable instructions. One format.

Skills are reusable instructions in a canonical skill markdown format. List shows built in and installed skills. Info inspects metadata, validate checks the definition, and load renders instructions. The skill alias works too. Inject a named skill with the skill flag on a launcher. Project skills resolve before built ins, and unknown skill identifiers fail before launch.

## 07:29 Author your project workflow

Create generates a validated project skill template. Add validates and copies a skill directory, including supported bounded references. Installed narrows discovery to project skills, and force explicitly replaces an existing entry. The shipped workflows cover areas such as debugging, planning, verification, security, and interface work. They remain instructions for the agent, rather than a second execution engine.

## 07:55 Trace and verify evidence

Impact follows reverse dependencies to show affected files and a deterministic risk score; breaking change comparison is incomplete. Trace accepts a stack trace, file, or standard input. Verify checks cited paths and can run configured commands. In our demo, symbol verification falsely rejected authenticate even though search found it. Refresh baseline is also not wired into the CLI action.

## 08:20 Probe, diagnose, evaluate

Inspect HTTP probes a running local service with bounded output; remote targets require an explicit flag. Doctor checks runtime, index, agents, registrations, and provider sanity. Evaluate aggregates available evidence and configuration, not a complete live quality audit. Warden status checks availability. Warden run explicitly executes a command through an existing policy; the sandboxing tool is optional.

## 08:47 Strong core. Launch blockers remain.

CodeAtlas has a working context engine, toolkit, and MCP integration, with thirteen hundred ninety four tests passing. A broad beta still needs fixes: secret path filtering, implicit update checks, session recovery, visible agent output, and symbol verification. The production dependency audit also reports advisories requiring triage. Passing tests are valuable evidence, but they do not make these launch blockers disappear.

## 09:14 Map. Ask. Review. Then act.

Start with a small project. Index it, search a known symbol, ask for a bounded slice, and review an exported package before sending it to your agent. Use help on any command for every subcommand and flag. The companion includes the complete generated reference, real command captures, the beta audit, and editable Remotion source for this walkthrough.
