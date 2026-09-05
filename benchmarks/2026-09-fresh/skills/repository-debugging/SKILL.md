---
name: repository-debugging
description: Debug and investigate issues in unfamiliar repositories, trace behavior across modules and layers
version: 1.0.0
allowed-tools: [web_search, web_fetch, github]
---

# Repository Debugging

Use this when the task is to diagnose a defect in a codebase you do not already know, where the bug interacts across files, modules, or layers.

## Workflow
1. **Map the architecture first.** Identify entry points, module boundaries, and the data/control flow before hunting the bug. Cite the files you inspected so the reasoning is auditable.
2. **Reproduce with what you can see.** Establish the failing behavior from tests, logs, or a minimal scenario.
3. **Follow the dependency/ownership chain.** Trace symbol usage across call sites, imports, and infrastructure boundaries (config → handler → service → store).
4. **Differ local vs upstream vs misuse.** Decide whether the defect is in this repo, in a dependency behavior, or in how the app uses a dependency. Use external research only when the repo cannot answer (see Config C/D tools).
5. **Propose the root cause** with evidence from specific files/lines, not vibes.
6. **Make the smallest correct change; do not re-architect while debugging.**

## Checklist
- [ ] Produced an architecture/flow map with cited files
- [ ] Reproduced the failure concretely
- [ ] Traced the behavior across the relevant modules
- [ ] Distinguished repo bug / dependency behavior / misuse
- [ ] Root cause stated with file+line evidence
- [ ] Change is minimal and behavior-preserving elsewhere
- [ ] Relevant tests pass; regression noted if any

## Verification
Give the reproduction path and the file/line evidence. State explicitly what you verified did NOT change.

## Common failure prevention
- Don't fix the nearest-looking file; confirm it is on the failing path.
- Don't assume the docs/README describe current behavior — the code is the source of truth.