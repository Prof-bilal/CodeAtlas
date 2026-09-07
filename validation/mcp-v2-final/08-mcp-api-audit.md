# MCP API Audit — CodeAtlas MCP V2

**Date:** 2026-09-07 | **Commit:** 04f0d6f

## Current Tool Surface: 8 Tools + 4 Aliases = 12 Protocol Names

| Tool | Alias | Purpose | Schema | Tests | Score |
|------|-------|---------|--------|-------|-------|
| find_relevant_context | context_for | Budgeted tiered excerpts + sufficiency | Yes (brief, maxItems, maxTokens, contextMode) | 6 tests | HIGH |
| search_symbols | — | Ranked symbol search + kind filter | Yes (query, limit, kind, minScore) | 4 tests | HIGH |
| search_files | — | Ranked file search | Yes (query, limit, minScore) | 3 tests | HIGH |
| get_dependencies | dependencies_of | Graph edges with direction/depth | Yes (node, relation, direction, limit, depth) | 7 tests | HIGH |
| read_file_range | read_range | Version-aware working-tree read | Yes (path, startLine, endLine, padding, expectedHash) | 6 tests | HIGH |
| project_overview | overview | Counts/languages/summary | Yes (includeSummary, detail) | 4 tests | MEDIUM |
| inspect_symbol | — | Declaration + callers/callees + tests | Yes (symbol) | 5 tests | HIGH |
| get_summary | — | Stored summary; opt-in AI generate | Yes (target, kind, generate, force) | 5 tests | MEDIUM |

## Proposed vs Current

| Proposed Primitive | Current Equivalent | Status |
|-------------------|-------------------|--------|
| context_for() | find_relevant_context + context_for alias | EXISTING |
| search_symbols() | search_symbols | EXISTING |
| search_files() | search_files | EXISTING |
| dependencies_of() | get_dependencies + dependencies_of alias | EXISTING |
| read_range() | read_file_range + read_range alias | EXISTING |
| overview() | project_overview + overview alias | EXISTING |

**Verdict:** Current API already provides all 6 proposed primitives. The surface is appropriately sized.

## Removed Tools (Phase 6)

| Tool | Reason | Status |
|------|--------|--------|
| analyze_task | Model can classify; internal classifier kept | REMOVED |
| create_plan | Template steps add tokens; impact-set kept internally | REMOVED |
| verify_answer | Belongs to harness, not retrieval API | REMOVED |
| explain_module | Overlaps overview+search+deps | REMOVED |

## API Quality Assessment

| Dimension | Rating | Evidence |
|-----------|--------|----------|
| Input validation | GOOD | Zod schemas on all 8 tools |
| Error clarity | GOOD | ToolDomainError for domain, ToolInputError for input |
| Structured responses | GOOD | structuredContent + schemas |
| Score normalization | GOOD | 0..1 with confidence bands |
| Freshness metadata | GOOD | On every response |
| Timing metadata | GOOD | timingsField added in Phase 6 |
| Brief mode | GOOD | One-line pointers available |
| Budget transparency | GOOD | BudgetRecord exposed |

## Recommendation

The MCP surface is appropriately sized at 8+4. No tools need to be added or removed. The aliases (context_for, dependencies_of, read_range, overview) provide clean naming without breaking backward compatibility.
