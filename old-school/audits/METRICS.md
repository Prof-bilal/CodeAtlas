# Metrics & Token Analytics

> Local-first usage metrics and estimated token savings for CodeAtlas.

## Overview

CodeAtlas collects local metrics about repository activity and estimated AI
context savings. All data stays on your machine in `.codeatlas/metrics.json`.
No telemetry, no uploads, no cloud backend.

## What Metrics Are Collected

### Repository Metrics
- Repository name
- Indexed files, lines of code, symbols, dependencies
- Language breakdown (TypeScript, JavaScript, etc.)
- Scan count, first scan time, latest scan time

### Activity Metrics
- Scans performed
- Searches executed
- Context requests
- MCP tool requests
- Files read
- Files modified

### Token Metrics (estimated)
- Estimated baseline tokens (what you'd send without CodeAtlas)
- Estimated CodeAtlas context tokens (what CodeAtlas assembles)
- Estimated tokens saved
- Savings percentage

### Performance Metrics
- Average scan latency
- Average search latency
- Average context retrieval latency

### Daily History
- Rolling 90-day window of daily aggregated activity
- Per-day token usage and savings

## Storage

Metrics are stored in `.codeatlas/metrics.json` inside your repository:

```
repository/
└── .codeatlas/
    ├── index/
    └── metrics.json
```

The file uses atomic writes (write to `.tmp` then rename) to prevent
corruption from crashes or concurrent operations.

## JSON Schema

```json
{
  "version": 1,
  "generatedAt": "2026-08-16T00:00:00.000Z",
  "repository": {
    "name": "my-project",
    "files": 342,
    "lines": 48291,
    "symbols": 8214,
    "dependencies": 1203,
    "languages": { "typescript": 61, "javascript": 18 },
    "scanCount": 18,
    "firstScanAt": "2026-08-01T00:00:00.000Z",
    "latestScanAt": "2026-08-16T00:00:00.000Z"
  },
  "activity": {
    "scans": 18,
    "searches": 183,
    "contextRequests": 92,
    "mcpRequests": 45,
    "filesRead": 421,
    "filesModified": 86
  },
  "tokens": {
    "estimatedBaseline": 1245000,
    "estimatedCodeatlas": 382000,
    "estimatedSaved": 863000,
    "savingsPercent": 69.32
  },
  "performance": {
    "averageScanMs": 421,
    "averageSearchMs": 18,
    "averageContextMs": 41
  },
  "daily": [
    {
      "date": "2026-08-16",
      "scans": 2,
      "searches": 34,
      "contextRequests": 18,
      "mcpRequests": 5,
      "filesRead": 50,
      "filesModified": 12,
      "tokensUsed": 42000,
      "estimatedBaselineTokens": 121000,
      "estimatedTokensSaved": 79000
    }
  ]
}
```

## Token Estimation

Token counts are **estimates**, not actual provider-reported values.

The heuristic uses `Math.ceil(text.length / 4)` — approximately 4 characters
per token. This is a documented approximation; actual tokenization varies by
model and content.

- **Baseline tokens**: estimated tokens for sending an entire repository
  context (total lines × ~40 chars/line / 4).
- **CodeAtlas tokens**: estimated tokens for the focused context CodeAtlas
  assembles.
- **Tokens saved**: `baseline - codeatlas`.
- **Savings percent**: `(saved / baseline) × 100`.

These values are estimates. We use wording like "Estimated tokens saved"
rather than claiming exact savings unless actual provider telemetry is added
in the future.

## Privacy

The metrics file does **NOT** contain:
- Source code or file contents
- API keys or secrets
- Environment variables
- Prompts or AI responses
- Passwords or credentials
- Absolute file paths (only counts are tracked)

The metrics file **does** contain:
- Repository name (anonymize via `--json` and editing if desired)
- Numeric counters and latency averages
- Language distribution (percentages only)

## CLI Commands

### `atlas metrics`
Show a concise summary of local usage metrics.

### `atlas metrics show`
Same as `atlas metrics`. Accepts `--json` for machine-readable output.

### `atlas metrics export`
Export metrics to a file.
- `--output <path>` — output file path (default: `codeatlas-metrics.json`)
- `--csv` — export as CSV (daily history only)

### `atlas metrics reset`
Clear all collected metrics. Requires `--yes` to confirm.

## SDK Usage

```typescript
import { createMetricsService } from "@atlas/sdk";

const metrics = createMetricsService({
  filePath: ".codeatlas/metrics.json",
});

// Record events
metrics.recordScan({ files: 100, lines: 5000, symbols: 500, dependencies: 20,
  languages: { typescript: 80 }, latencyMs: 250 });
metrics.recordSearch({ latencyMs: 15 });
metrics.recordContextRequest({ estimatedTokens: 500, latencyMs: 40 });

// Read snapshot
const snapshot = metrics.snapshot();
console.log(snapshot.tokens.savingsPercent);

// Export
import { exportMetricsJson } from "@atlas/sdk";
exportMetricsJson(snapshot, { outputPath: "export.json" });

metrics.close();
```

## Limitations

This MVP cannot measure:
- Actual provider-reported token usage (only estimates)
- Per-model or per-provider breakdowns
- Cost estimates (no pricing integration)
- Task-level or session-level metrics
- Agent-specific usage
- Real-time dashboard (exported JSON only, for now)

## Future Extensibility

The schema (`version: 1`) is designed to support future additions:
- Actual provider token counts (when available from providers)
- Per-model usage breakdowns
- Cost estimates
- Agent-level metrics
- Task complexity tracking

Schema versioning ensures old metrics files are not broken by new fields.
