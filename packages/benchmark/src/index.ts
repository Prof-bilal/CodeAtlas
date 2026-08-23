// @atlas/benchmark — Benchmark harness for CodeAtlas
//
// Declarative evaluation of context quality against baseline,
// with automated scoring and Markdown reporting.

export { BenchmarkService } from "./benchmark.service";
export type { BenchmarkRunner } from "@atlas/core";
export { BenchmarkStore } from "./store";
export { evaluateTask, fileHits, conceptHits, citedPaths } from "./evaluator";
export { renderReport, renderSummary, renderHtml } from "./reporter";
export { scaffoldSuite, scaffoldTaskFile } from "./scaffold";
export { OpenCodeRunner } from "./runner/opencode";
export { OllamaRunner, type OllamaRunnerAgents } from "./runner/ollama";
