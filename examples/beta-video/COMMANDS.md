# Complete command reference — CodeAtlas 0.5.1

Generated from the registered Commander command tree on 2026-09-30.

The video explains each top-level command and the main subcommand workflows. This companion includes every registered subcommand and flag.

## atlas

CodeAtlas — an open-source AI context engine for coding agents

```text
Usage: atlas [options] [command]

CodeAtlas — an open-source AI context engine for coding agents

Options:
  -V, --version                   output the version number
  -h, --help                      display help for command

Commands:
  init [options]                  Initialize and index the current project
  build [options]                 Build the CodeAtlas index for a project
  update [options]                Incrementally update an existing CodeAtlas
                                  index
  search [options] <query...>     Search the CodeAtlas index (symbols, files,
                                  modules, dependencies, summaries)
  scan [options]                  Show a hierarchical overview of a project
                                  tree (no indexing)
  sessions                        Manage external AI agent sessions
  usage                           Show AI usage, credits, budgets, and limits
                                  (local-first)
  metrics                         Show local usage & token analytics metrics
  providers [options]             Show the status of all AI providers (Ollama,
                                  OpenAI, …)
  ollama                          Connect, inspect, and manage the optional
                                  Ollama AI provider
  agents                          Register the CodeAtlas MCP server for
                                  installed AI coding tools
  tools [options]                 Discover, install, configure, and inspect
                                  toolkit tools
  ask [options] <question>        Get a ranked, budgeted context slice for a
                                  question (never the whole repo)
  context                         Build safe, budgeted repository context for
                                  an AI agent
  claude [options] <prompt...>    Launch the claude AI coding CLI with safe
                                  repository context for <prompt...>
  gemini [options] <prompt...>    Launch the gemini AI coding CLI with safe
                                  repository context for <prompt...>
  codex [options] <prompt...>     Launch the codex AI coding CLI with safe
                                  repository context for <prompt...>
  opencode [options] <prompt...>  Launch the opencode AI coding CLI with safe
                                  repository context for <prompt...>
  explain [options] <target>      Explain a symbol, file, module, or concept
                                  from the CodeAtlas index
  doctor [options]                Diagnose the CodeAtlas installation and this
                                  repository's index
  mcp [options]                   Start the CodeAtlas MCP server over stdio
                                  (for AI coding tools)
  verify [options] [task]         Run claim checks and verification commands
                                  against an answer
  warden                          Inspect and explicitly run MCP processes in
                                  Warden
  skills|skill                    Discover, inspect, validate, and load
                                  built-in and installed Agent Skills
  setup [options]                 Detect the project, then choose which Tools
                                  and Skills to install
  impact [options] <paths...>     Compute the blast radius of changed files:
                                  reverse-dependency closure, affected tests,
                                  and risk score
  inspect                         Inspect running services (HTTP probes,
                                  network capture)
  evaluate [options]              Generate a completion report aggregating
                                  build, test, QA, and a11y results
  trace [options] [stacktrace]    Parse a stack trace and ground it against the
                                  CodeAtlas index (resolve frames to indexed
                                  symbols and call paths)
```

## atlas init

Initialize and index the current project

```text
Usage: atlas init [options]

Initialize and index the current project

Options:
  --repo <path>     repository path (defaults to ATLAS_ROOT or cwd)
  --json            print the indexing result as JSON
  --summaries       generate AI file summaries for the indexed files
  --tools <choice>  tool selection for the post-init offer (all | none | 1,2,3)
  -h, --help        display help for command
```

## atlas build

Build the CodeAtlas index for a project

```text
Usage: atlas build [options]

Build the CodeAtlas index for a project

Options:
  --repo <path>     repository path (defaults to ATLAS_ROOT or cwd)
  --json            print the indexing result as JSON
  --summaries       generate AI file summaries for the indexed files
  --tools <choice>  tool selection for the post-init offer (all | none | 1,2,3)
  -h, --help        display help for command
```

## atlas update

Incrementally update an existing CodeAtlas index

```text
Usage: atlas update [options]

Incrementally update an existing CodeAtlas index

Options:
  --repo <path>     repository path (defaults to ATLAS_ROOT or cwd)
  --json            print the indexing result as JSON
  --summaries       generate AI file summaries for the indexed files
  --tools <choice>  tool selection for the post-init offer (all | none | 1,2,3)
  -h, --help        display help for command
```

## atlas search

Search the CodeAtlas index (symbols, files, modules, dependencies, summaries)

```text
Usage: atlas search [options] <query...>

Search the CodeAtlas index (symbols, files, modules, dependencies, summaries)

Arguments:
  query                 search query (multiple words are joined)

Options:
  --repo <path>         repository path (defaults to ATLAS_ROOT or cwd)
  -l, --limit <number>  maximum number of results to show
  -t, --type <kind>     restrict results to a kind (repeatable) (default: [])
  --no-fuzzy            disable typo-tolerant fuzzy matching
  --json                print results as JSON
  --ai                  generate AI summaries for the top file hits (requires a
                        configured provider)
  -h, --help            display help for command
```

## atlas scan

Show a hierarchical overview of a project tree (no indexing)

```text
Usage: atlas scan [options]

Show a hierarchical overview of a project tree (no indexing)

Options:
  --repo <path>  repository path (defaults to ATLAS_ROOT or cwd)
  --json         print the scan result as JSON
  -h, --help     display help for command
```

## atlas sessions

Manage external AI agent sessions

```text
Usage: atlas sessions [options] [command]

Manage external AI agent sessions

Options:
  -h, --help        display help for command

Commands:
  list              List tracked agent sessions
  info <sessionId>  Show details for one session
  stop <sessionId>  Gracefully stop a running session and report its token
                    impact
```

## atlas sessions list

List tracked agent sessions

```text
Usage: atlas sessions list [options]

List tracked agent sessions

Options:
  -h, --help  display help for command
```

## atlas sessions info

Show details for one session

```text
Usage: atlas sessions info [options] <sessionId>

Show details for one session

Options:
  -h, --help  display help for command
```

## atlas sessions stop

Gracefully stop a running session and report its token impact

```text
Usage: atlas sessions stop [options] <sessionId>

Gracefully stop a running session and report its token impact

Options:
  -h, --help  display help for command
```

## atlas usage

Show AI usage, credits, budgets, and limits (local-first)

```text
Usage: atlas usage [options] [command]

Show AI usage, credits, budgets, and limits (local-first)

Options:
  -h, --help         display help for command

Commands:
  list [options]     List recorded usage events
  budgets [options]  Show budget status
  summary [options]  Show usage totals, latency, and budget status
```

## atlas usage list

List recorded usage events

```text
Usage: atlas usage list [options]

List recorded usage events

Options:
  --json                 print results as JSON
  --provider <provider>  filter by provider
  --task <taskId>        filter by task ID
  -h, --help             display help for command
```

## atlas usage budgets

Show budget status

```text
Usage: atlas usage budgets [options]

Show budget status

Options:
  --json      print results as JSON
  -h, --help  display help for command
```

## atlas usage summary

Show usage totals, latency, and budget status

```text
Usage: atlas usage summary [options]

Show usage totals, latency, and budget status

Options:
  --json                 print results as JSON
  --provider <provider>  filter by provider
  --task <taskId>        filter by task ID
  -h, --help             display help for command
```

## atlas metrics

Show local usage & token analytics metrics

```text
Usage: atlas metrics [options] [command]

Show local usage & token analytics metrics

Options:
  -h, --help        display help for command

Commands:
  show [options]    Show metrics summary
  export [options]  Export metrics to a file
  reset [options]   Reset all metrics (clears .codeatlas/metrics.json)
```

## atlas metrics show

Show metrics summary

```text
Usage: atlas metrics show [options]

Show metrics summary

Options:
  --json      print results as JSON
  -h, --help  display help for command
```

## atlas metrics export

Export metrics to a file

```text
Usage: atlas metrics export [options]

Export metrics to a file

Options:
  -o, --output <path>  output file path (default: codeatlas-metrics.json)
  --csv                export as CSV (daily history only)
  -h, --help           display help for command
```

## atlas metrics reset

Reset all metrics (clears .codeatlas/metrics.json)

```text
Usage: atlas metrics reset [options]

Reset all metrics (clears .codeatlas/metrics.json)

Options:
  --yes       skip confirmation
  -h, --help  display help for command
```

## atlas providers

Show the status of all AI providers (Ollama, OpenAI, …)

```text
Usage: atlas providers [options]

Show the status of all AI providers (Ollama, OpenAI, …)

Options:
  --json      print results as JSON
  -h, --help  display help for command
```

## atlas ollama

Connect, inspect, and manage the optional Ollama AI provider

```text
Usage: atlas ollama [options] [command]

Connect, inspect, and manage the optional Ollama AI provider

Options:
  -h, --help         display help for command

Commands:
  status [options]   Show the Ollama connection status
  connect [options]  Test and save the Ollama connection (local server or cloud
                     key)
  disconnect         Clear the saved Ollama connection (env keys are kept)
  models [options]   List models exposed by the Ollama server
  use <model>        Select the active Ollama model for context summarization
```

## atlas ollama status

Show the Ollama connection status

```text
Usage: atlas ollama status [options]

Show the Ollama connection status

Options:
  --json      print results as JSON
  -h, --help  display help for command
```

## atlas ollama connect

Test and save the Ollama connection (local server or cloud key)

```text
Usage: atlas ollama connect [options]

Test and save the Ollama connection (local server or cloud key)

Options:
  --api-key <key>   Ollama API key (Ollama Cloud); omit for a local server
  --base-url <url>  Ollama base URL (default http://localhost:11434)
  --save-key        persist the API key in ~/.codeatlas/providers.json (0600)
  --json            print results as JSON
  -h, --help        display help for command
```

## atlas ollama disconnect

Clear the saved Ollama connection (env keys are kept)

```text
Usage: atlas ollama disconnect [options]

Clear the saved Ollama connection (env keys are kept)

Options:
  -h, --help  display help for command
```

## atlas ollama models

List models exposed by the Ollama server

```text
Usage: atlas ollama models [options]

List models exposed by the Ollama server

Options:
  --json      print results as JSON
  -h, --help  display help for command
```

## atlas ollama use

Select the active Ollama model for context summarization

```text
Usage: atlas ollama use [options] <model>

Select the active Ollama model for context summarization

Options:
  -h, --help  display help for command
```

## atlas agents

Register the CodeAtlas MCP server for installed AI coding tools

```text
Usage: atlas agents [options] [command]

Register the CodeAtlas MCP server for installed AI coding tools

Options:
  -h, --help         display help for command

Commands:
  status [options]   Show each AI coding tool and its CodeAtlas MCP
                     registration status
  connect [options]  Register the CodeAtlas MCP server for installed, supported
                     agents
```

## atlas agents status

Show each AI coding tool and its CodeAtlas MCP registration status

```text
Usage: atlas agents status [options]

Show each AI coding tool and its CodeAtlas MCP registration status

Options:
  --json      print the status as JSON
  -h, --help  display help for command
```

## atlas agents connect

Register the CodeAtlas MCP server for installed, supported agents

```text
Usage: atlas agents connect [options]

Register the CodeAtlas MCP server for installed, supported agents

Options:
  --target <target>     restrict to one target (claude, gemini, codex,
                        opencode, cursor, cline)
  --config-home <path>  user configuration root (for testing or managed
                        environments)
  --dry-run             render changes without writing
  --json                print the plan/result as JSON
  -h, --help            display help for command
```

## atlas tools

Discover, install, configure, and inspect toolkit tools

```text
Usage: atlas tools [options] [command]

Discover, install, configure, and inspect toolkit tools

Options:
  --category <cat>            filter overview to tools in a category
  -h, --help                  display help for command

Commands:
  search [options] <query>    Search the curated tool registry
  categories [options]        List all tool categories
  create [options] <name>     Create and persist a schema-validated custom tool
                              definition
  validate [options]          Validate a custom tool definition without writing
                              or installing it
  add [options]               Validate and add a custom tool to the
                              project-local registry overlay
  info [options] <tool>       Show registry, security, and installed manifest
                              details
  install [options] <tool>    Plan and install a tool through compatibility,
                              security, approval, and verification
  remove [options] <tool>     Uninstall a tool through its Toolkit adapter
  update [options]            Update all installed tools to their latest
                              versions
  configure [options] <tool>  Configure an installed tool for supported,
                              installed agents
  doctor [options]            Reconcile installed manifests, integration state,
                              and trust
```

## atlas tools search

Search the curated tool registry

```text
Usage: atlas tools search [options] <query>

Search the curated tool registry

Options:
  --json            print results as JSON
  --category <cat>  filter results to tools in a category
  -h, --help        display help for command
```

## atlas tools categories

List all tool categories

```text
Usage: atlas tools categories [options]

List all tool categories

Options:
  --json      print results as JSON
  -h, --help  display help for command
```

## atlas tools create

Create and persist a schema-validated custom tool definition

```text
Usage: atlas tools create [options] <name>

Create and persist a schema-validated custom tool definition

Options:
  --description <text>     Tool description
  --license <license>      Tool license identifier
  --category <categories>  Comma-separated categories
  --version <version>      Tool version (default: 0.1.0)
  --install-type <type>    Install method: npm, pip, cargo, go, skill, or
                           another declared type
  --package <id>           Package or repository identifier for the install
                           method
  --repository <url>       Official repository URL
  --documentation <url>    Documentation URL
  --os <platforms>         Comma-separated supported platforms
  --replace                explicitly replace an existing record
  --json                   print the result as JSON
  -h, --help               display help for command
```

## atlas tools validate

Validate a custom tool definition without writing or installing it

```text
Usage: atlas tools validate [options]

Validate a custom tool definition without writing or installing it

Options:
  --file <path>  JSON file containing one tool record
  --json         print validation as JSON
  -h, --help     display help for command
```

## atlas tools add

Validate and add a custom tool to the project-local registry overlay

```text
Usage: atlas tools add [options]

Validate and add a custom tool to the project-local registry overlay

Options:
  --file <path>  JSON file containing one tool record
  --replace      explicitly replace an existing catalog or overlay record
  --json         print the result as JSON
  -h, --help     display help for command
```

## atlas tools info

Show registry, security, and installed manifest details

```text
Usage: atlas tools info [options] <tool>

Show registry, security, and installed manifest details

Options:
  --json      print details as JSON
  -h, --help  display help for command
```

## atlas tools install

Plan and install a tool through compatibility, security, approval, and verification

```text
Usage: atlas tools install [options] <tool>

Plan and install a tool through compatibility, security, approval, and
verification

Options:
  --yes          approve the displayed install plan
  --note <note>  record an approval note
  --json         print the plan/result as JSON
  -h, --help     display help for command
```

## atlas tools remove

Uninstall a tool through its Toolkit adapter

```text
Usage: atlas tools remove [options] <tool>

Uninstall a tool through its Toolkit adapter

Options:
  --json      print the result as JSON
  -h, --help  display help for command
```

## atlas tools update

Update all installed tools to their latest versions

```text
Usage: atlas tools update [options]

Update all installed tools to their latest versions

Options:
  --json      print the result as JSON
  --approve   skip the per-tool approval prompt
  -h, --help  display help for command
```

## atlas tools configure

Configure an installed tool for supported, installed agents

```text
Usage: atlas tools configure [options] <tool>

Configure an installed tool for supported, installed agents

Options:
  --config-home <path>  user configuration root (for testing or managed
                        environments)
  --dry-run             render changes without writing
  --json                print the plan/result as JSON
  -h, --help            display help for command
```

## atlas tools doctor

Reconcile installed manifests, integration state, and trust

```text
Usage: atlas tools doctor [options]

Reconcile installed manifests, integration state, and trust

Options:
  --json      print the result as JSON
  -h, --help  display help for command
```

## atlas ask

Get a ranked, budgeted context slice for a question (never the whole repo)

```text
Usage: atlas ask [options] <question>

Get a ranked, budgeted context slice for a question (never the whole repo)

Options:
  --repo <path>          repository path (defaults to ATLAS_ROOT or cwd)
  --max-tokens <number>  maximum estimated tokens for the slice (default: null)
  --save [path]          persist the slice under .codeatlas/slices/ (and copy
                         the markdown to <path> when given)
  --json                 print the slice as JSON
  --plan                 classify the task and show a deterministic plan before
                         the context
  -h, --help             display help for command
```

## atlas context

Build safe, budgeted repository context for an AI agent

```text
Usage: atlas context [options] [command]

Build safe, budgeted repository context for an AI agent

Options:
  -h, --help                           display help for command

Commands:
  build [options] <task>               Build safe, budgeted repository context
                                       for an AI agent
  launch [options] <task>              Launch an AI CLI session seeded with
                                       safe repository context
  attach [options] <sessionId> <task>  Attach safe repository context to a
                                       CREATED session
  export [options] <task>              Export a context slice as a
                                       self-contained, agent-ready markdown
                                       file
  help [command]                       display help for command
```

## atlas context build

Build safe, budgeted repository context for an AI agent

```text
Usage: atlas context build [options] <task>

Build safe, budgeted repository context for an AI agent

Options:
  --repo <path>                repository path (defaults to ATLAS_ROOT or cwd)
  --explain                    show content-free item sources, scores, and
                               reasons
  --json                       print the package or explanation as JSON
  --context-mode <mode>        context assembly mode: auto (default),
                               auto-escalate, digest, full, off
  --max-tokens-total <number>  maximum estimated tokens
  --include-instructions       include project instruction files
  --no-instructions            exclude project instruction files
  --include-overview           include the project overview
  --no-overview                exclude the project overview
  --ai                         add an AI briefing of the assembled package
                               (requires a configured provider)
  --plan                       classify the task and include a deterministic
                               plan in the output
  -h, --help                   display help for command
```

## atlas context launch

Launch an AI CLI session seeded with safe repository context

```text
Usage: atlas context launch [options] <task>

Launch an AI CLI session seeded with safe repository context

Options:
  --provider <id>              AI agent provider id
  --repo <path>                repository path (defaults to ATLAS_ROOT or cwd)
  --json                       print the launched session as JSON
  --context-mode <mode>        context assembly mode: auto (default),
                               auto-escalate, digest, full, off
  --max-tokens-total <number>  maximum estimated tokens
  --include-instructions       include project instruction files
  --no-instructions            exclude project instruction files
  --include-overview           include the project overview
  --no-overview                exclude the project overview
  --ai                         prepend an AI briefing of the package to the
                               session prompt (requires a configured provider)
  --skill <id>                 inject a reusable Skill as prompt instructions
                               (custom first, then built-ins); repeatable
                               (default: [])
  -h, --help                   display help for command
```

## atlas context attach

Attach safe repository context to a CREATED session

```text
Usage: atlas context attach [options] <sessionId> <task>

Attach safe repository context to a CREATED session

Options:
  --json                       print the attached session as JSON
  --context-mode <mode>        context assembly mode: auto (default),
                               auto-escalate, digest, full, off
  --max-tokens-total <number>  maximum estimated tokens
  --include-instructions       include project instruction files
  --no-instructions            exclude project instruction files
  --include-overview           include the project overview
  --no-overview                exclude the project overview
  --ai                         prepend an AI briefing of the package to the
                               session prompt (requires a configured provider)
  --skill <id>                 inject a reusable Skill as prompt instructions
                               (custom first, then built-ins); repeatable
                               (default: [])
  -h, --help                   display help for command
```

## atlas context export

Export a context slice as a self-contained, agent-ready markdown file

```text
Usage: atlas context export [options] <task>

Export a context slice as a self-contained, agent-ready markdown file

Options:
  --for <agent>                target agent (claude, gemini, codex, opencode,
                               generic)
  --repo <path>                repository path (defaults to ATLAS_ROOT or cwd)
  --out <file>                 output file (default
                               .codeatlas/exports/<task>-<id>.md)
  --context-mode <mode>        context assembly mode: auto (default),
                               auto-escalate, digest, full, off
  --max-tokens-total <number>  maximum estimated tokens
  --no-inject                  do not append the instruction block to the
                               target agent's instruction file
  --json                       print the export outcome as JSON
  -h, --help                   display help for command
```

## atlas claude

Launch the claude AI coding CLI with safe repository context for <prompt...>

```text
Usage: atlas claude [options] <prompt...>

Launch the claude AI coding CLI with safe repository context for <prompt...>

Arguments:
  prompt                       what you want the agent to do

Options:
  --repo <path>                repository path (defaults to ATLAS_ROOT or cwd)
  --json                       print the launched session as JSON
  --context-mode <mode>        context assembly mode: auto (default),
                               auto-escalate, digest, full, off
  --max-tokens-total <number>  maximum estimated tokens
  --include-instructions       include project instruction files
  --no-instructions            exclude project instruction files
  --include-overview           include the project overview
  --no-overview                exclude the project overview
  --ai                         prepend an AI briefing of the package to the
                               session prompt (requires a configured provider)
  --skill <id>                 inject a reusable Skill as prompt instructions
                               (custom first, then built-ins); repeatable
                               (default: [])
  -h, --help                   display help for command
```

## atlas gemini

Launch the gemini AI coding CLI with safe repository context for <prompt...>

```text
Usage: atlas gemini [options] <prompt...>

Launch the gemini AI coding CLI with safe repository context for <prompt...>

Arguments:
  prompt                       what you want the agent to do

Options:
  --repo <path>                repository path (defaults to ATLAS_ROOT or cwd)
  --json                       print the launched session as JSON
  --context-mode <mode>        context assembly mode: auto (default),
                               auto-escalate, digest, full, off
  --max-tokens-total <number>  maximum estimated tokens
  --include-instructions       include project instruction files
  --no-instructions            exclude project instruction files
  --include-overview           include the project overview
  --no-overview                exclude the project overview
  --ai                         prepend an AI briefing of the package to the
                               session prompt (requires a configured provider)
  --skill <id>                 inject a reusable Skill as prompt instructions
                               (custom first, then built-ins); repeatable
                               (default: [])
  -h, --help                   display help for command
```

## atlas codex

Launch the codex AI coding CLI with safe repository context for <prompt...>

```text
Usage: atlas codex [options] <prompt...>

Launch the codex AI coding CLI with safe repository context for <prompt...>

Arguments:
  prompt                       what you want the agent to do

Options:
  --repo <path>                repository path (defaults to ATLAS_ROOT or cwd)
  --json                       print the launched session as JSON
  --context-mode <mode>        context assembly mode: auto (default),
                               auto-escalate, digest, full, off
  --max-tokens-total <number>  maximum estimated tokens
  --include-instructions       include project instruction files
  --no-instructions            exclude project instruction files
  --include-overview           include the project overview
  --no-overview                exclude the project overview
  --ai                         prepend an AI briefing of the package to the
                               session prompt (requires a configured provider)
  --skill <id>                 inject a reusable Skill as prompt instructions
                               (custom first, then built-ins); repeatable
                               (default: [])
  -h, --help                   display help for command
```

## atlas opencode

Launch the opencode AI coding CLI with safe repository context for <prompt...>

```text
Usage: atlas opencode [options] <prompt...>

Launch the opencode AI coding CLI with safe repository context for <prompt...>

Arguments:
  prompt                       what you want the agent to do

Options:
  --repo <path>                repository path (defaults to ATLAS_ROOT or cwd)
  --json                       print the launched session as JSON
  --context-mode <mode>        context assembly mode: auto (default),
                               auto-escalate, digest, full, off
  --max-tokens-total <number>  maximum estimated tokens
  --include-instructions       include project instruction files
  --no-instructions            exclude project instruction files
  --include-overview           include the project overview
  --no-overview                exclude the project overview
  --ai                         prepend an AI briefing of the package to the
                               session prompt (requires a configured provider)
  --skill <id>                 inject a reusable Skill as prompt instructions
                               (custom first, then built-ins); repeatable
                               (default: [])
  -h, --help                   display help for command
```

## atlas explain

Explain a symbol, file, module, or concept from the CodeAtlas index

```text
Usage: atlas explain [options] <target>

Explain a symbol, file, module, or concept from the CodeAtlas index

Arguments:
  target         symbol, file path, module path, or concept to explain

Options:
  --repo <path>  repository path (defaults to ATLAS_ROOT or cwd)
  --json         print the explanation as JSON
  --ai           generate a fresh AI summary (requires a configured provider;
                 deterministic data is always included)
  -h, --help     display help for command
```

## atlas doctor

Diagnose the CodeAtlas installation and this repository's index

```text
Usage: atlas doctor [options]

Diagnose the CodeAtlas installation and this repository's index

Options:
  --repo <path>  repository path (defaults to ATLAS_ROOT or cwd)
  --json         print the report as JSON
  -h, --help     display help for command
```

## atlas mcp

Start the CodeAtlas MCP server over stdio (for AI coding tools)

```text
Usage: atlas mcp [options]

Start the CodeAtlas MCP server over stdio (for AI coding tools)

Options:
  --root <path>  project root to index (defaults to ATLAS_ROOT or cwd)
  -h, --help     display help for command
```

## atlas verify

Run claim checks and verification commands against an answer

```text
Usage: atlas verify [options] [task]

Run claim checks and verification commands against an answer

Arguments:
  task                      The task description to verify against

Options:
  --paths <paths>           Comma-separated file paths cited in the answer
  --symbols <symbols>       Comma-separated symbol names cited in the answer
  --plan-targets <targets>  Comma-separated plan targets the answer should
                            cover
  --config <path>           Path to verify.json (default:
                            .codeatlas/verify.json)
  --refresh-baseline        Refresh the baseline before verifying
  --json                    Output results as JSON
  --docs                    Run documentation drift check: detect undocumented
                            exports and stale doc references
  -h, --help                display help for command
```

## atlas warden

Inspect and explicitly run MCP processes in Warden

```text
Usage: atlas warden [options] [command]

Inspect and explicitly run MCP processes in Warden

Options:
  -h, --help                         display help for command

Commands:
  status [options]                   Report Warden availability without
                                     executing it
  run [options] <command> [args...]  Explicitly run a command through Warden
                                     using a policy file
  help [command]                     display help for command
```

## atlas warden status

Report Warden availability without executing it

```text
Usage: atlas warden status [options]

Report Warden availability without executing it

Options:
  --json      Output as JSON
  -h, --help  display help for command
```

## atlas warden run

Explicitly run a command through Warden using a policy file

```text
Usage: atlas warden run [options] <command> [args...]

Explicitly run a command through Warden using a policy file

Options:
  --policy <path>  Warden policy file
  --cwd <path>     Working directory (default: current directory)
  --timeout <ms>   Timeout in milliseconds
  --json           Output captured result as JSON
  -h, --help       display help for command
```

## atlas skills

Discover, inspect, validate, and load built-in and installed Agent Skills

```text
Usage: atlas skills|skill [options] [command]

Discover, inspect, validate, and load built-in and installed Agent Skills

Options:
  -h, --help               display help for command

Commands:
  create [options] <id>    Create a validated custom Skill template
  add [options]            Validate and add a custom Skill directory to
                           .codeatlas/skills/
  list [options] [id]      List built-in and installed Skills, or show one
                           Skill in full (default when no subcommand is given)
  info [options] <id>      Show full information for a built-in or installed
                           Skill
  validate [options] <id>  Validate a built-in or installed Skill and report
                           any problems
  load [options] <id>      Load and render a built-in or installed Skill into a
                           prompt block
  help [command]           display help for command
```

## atlas skills create

Create a validated custom Skill template

```text
Usage: atlas skills create [options] <id>

Create a validated custom Skill template

Options:
  --description <text>  Skill description
  --root <path>         Project root (default: current directory)
  --force               Replace an existing Skill
  --json                Output as JSON
  -h, --help            display help for command
```

## atlas skills add

Validate and add a custom Skill directory to .codeatlas/skills/

```text
Usage: atlas skills add [options]

Validate and add a custom Skill directory to .codeatlas/skills/

Options:
  --from <path>  Source Skill directory
  --id <id>      Destination Skill id (defaults to source directory name)
  --root <path>  Project root (default: current directory)
  --force        Replace an existing Skill
  --json         Output as JSON
  -h, --help     display help for command
```

## atlas skills list

List built-in and installed Skills, or show one Skill in full (default when no subcommand is given)

```text
Usage: atlas skills list [options] [id]

List built-in and installed Skills, or show one Skill in full (default when no
subcommand is given)

Options:
  --root <path>  Project root (default: current directory)
  --builtin      Only first-party Skills shipped with CodeAtlas
  --installed    Only Skills installed in .codeatlas/skills/
  --json         Output as JSON
  -h, --help     display help for command
```

## atlas skills info

Show full information for a built-in or installed Skill

```text
Usage: atlas skills info [options] <id>

Show full information for a built-in or installed Skill

Options:
  --root <path>  Project root (default: current directory)
  --builtin      Restrict the lookup to first-party Skills
  --json         Output as JSON
  -h, --help     display help for command
```

## atlas skills validate

Validate a built-in or installed Skill and report any problems

```text
Usage: atlas skills validate [options] <id>

Validate a built-in or installed Skill and report any problems

Options:
  --root <path>  Project root (default: current directory)
  --builtin      Restrict the lookup to first-party Skills
  --json         Output as JSON
  -h, --help     display help for command
```

## atlas skills load

Load and render a built-in or installed Skill into a prompt block

```text
Usage: atlas skills load [options] <id>

Load and render a built-in or installed Skill into a prompt block

Options:
  --root <path>    Project root (default: current directory)
  --builtin        Restrict the lookup to first-party Skills
  --no-references  Exclude reference files from output
  -h, --help       display help for command
```

## atlas setup

Detect the project, then choose which Tools and Skills to install

```text
Usage: atlas setup [options]

Detect the project, then choose which Tools and Skills to install

Options:
  --repo <path>  Project root (default: current directory)
  --tools <ids>  Comma-separated tool or Skill ids to install (skips the
                 prompt)
  --yes          Approve the selected installs
  --dry-run      Show the plan without installing anything
  --json         Output machine-readable JSON
  -h, --help     display help for command
```

## atlas impact

Compute the blast radius of changed files: reverse-dependency closure, affected tests, and risk score

```text
Usage: atlas impact [options] <paths...>

Compute the blast radius of changed files: reverse-dependency closure, affected
tests, and risk score

Options:
  --max-depth <n>  Maximum traversal depth (0 = unlimited) (default: "0")
  --no-tests       Exclude test files from results
  --no-docs        Exclude documentation files from results
  --breaking       Include breaking-change summary (export surface diff vs last
                   snapshot)
  --json           Output as JSON
  -h, --help       display help for command
```

## atlas inspect

Inspect running services (HTTP probes, network capture)

```text
Usage: atlas inspect [options] [command]

Inspect running services (HTTP probes, network capture)

Options:
  -h, --help            display help for command

Commands:
  http [options] <url>  Send an HTTP probe request to a running service
                        (localhost by default)
  help [command]        display help for command
```

## atlas inspect http

Send an HTTP probe request to a running service (localhost by default)

```text
Usage: atlas inspect http [options] <url>

Send an HTTP probe request to a running service (localhost by default)

Options:
  -X, --method <method>  HTTP method (GET, POST, PUT, ...) (default: "GET")
  -H, --header <header>  Add a request header (key: value). Repeatable.
                         (default: [])
  -d, --body <body>      Request body (for POST/PUT/PATCH)
  --timeout <ms>         Request timeout in milliseconds (default: "5000")
  --allow-remote         Allow non-localhost targets (requires explicit
                         acknowledgement)
  --json                 Output results as JSON
  -h, --help             display help for command
```

## atlas evaluate

Generate a completion report aggregating build, test, QA, and a11y results

```text
Usage: atlas evaluate [options]

Generate a completion report aggregating build, test, QA, and a11y results

Options:
  --repo <path>  Repository root (default: current directory)
  --json         Output report as JSON
  -h, --help     display help for command
```

## atlas trace

Parse a stack trace and ground it against the CodeAtlas index (resolve frames to indexed symbols and call paths)

```text
Usage: atlas trace [options] [stacktrace]

Parse a stack trace and ground it against the CodeAtlas index (resolve frames
to indexed symbols and call paths)

Arguments:
  stacktrace        Stack trace text (or pipe via stdin)

Options:
  --file <path>     Read stack trace from a file
  --repo <path>     Repository root (default: current directory)
  --max-frames <n>  Maximum frames to resolve (default: "20")
  --json            Output as JSON
  -h, --help        display help for command
```
