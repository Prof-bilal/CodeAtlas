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
export {
  runHiddenTests,
  hiddenTestsPassed,
  type RunHiddenTestsOptions,
  type HiddenTestResult,
} from "./test-runner";
export {
  SINGLE_ABLATION_SCENARIOS,
  generateAblationRequests,
  ablationTaskId,
  extractBaseTaskId,
  extractScenarioLabel,
  AblationRunner,
  type AblationScenario,
} from "./ablation";
export {
  PROVIDER_BUDGET_DEFAULTS,
  resolveBudget,
} from "./defaults";
export {
  evaluateRetrieval,
  scoreTaskRetrieval,
  type RetrievalResult,
  type RetrievalReport,
} from "./retrieval-metrics";
export {
  classifyFailure,
  classifyAllFailures,
  type FailureClassificationEntry,
  type FailureClassificationReport,
} from "./failure-classifier";
export {
  pairedBootstrap,
  isSignificant,
  describeDiff,
  type BootstrapResult,
  type BootstrapOptions,
  DEFAULT_BOOTSTRAP_OPTIONS,
} from "./paired-bootstrap";
export {
  pairedTTest,
  describeComparison,
  type SignificanceResult,
} from "./significance";
