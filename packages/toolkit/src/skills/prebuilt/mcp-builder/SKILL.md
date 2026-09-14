---
name: mcp-builder
description: Build and validate MCP servers with explicit schemas, bounded inputs, and safe error handling.
version: 1.0.0
allowed-tools: [atlas search, atlas inspect, atlas verify]
---

# MCP Builder

## Goal

Implement MCP server tools that are schema-first, bounded, and fail-closed, using the repository's existing port/adapter seams.

## When to use

- Adding or changing tools in an MCP server package (e.g. `packages/mcp`).
- Reviewing whether MCP tool inputs are bounded and errors are structured.

## Workflow

1. Inspect the repository and identify the MCP transport, tool boundaries, and existing SDK seams.
2. Define each tool's input and output schema before implementing handlers.
3. Keep handlers thin: validate bounded inputs, delegate to the owning SDK service, and return structured errors.
4. Never bypass the Context SDK or execute repository-derived shell strings.
5. Add malformed-input, domain-error, and output-schema tests.
6. Verify the server with the project's typecheck, lint, and test commands before reporting completion.

## Required capabilities

- Repository understanding: search, inspect
- Verification: project test/typecheck commands

## Expected output

Working MCP tool handlers with explicit schemas, bounded inputs, structured errors, and passing tests.

## Verification

- Schema definitions exist for every new or changed tool.
- Malformed-input and domain-error tests pass.
- Project typecheck, lint, and tests run clean.

## Rules / constraints

- Handlers must not query storage or databases directly; go through the SDK.
- No speculative capabilities: implement only tools with a real consumer.

## Security considerations

- All tool inputs are untrusted: validate and bound them at the schema boundary.
- Never construct shell strings from repository- or model-derived content.
- Never leak secrets through tool outputs or logs.
