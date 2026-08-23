import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type {
  BenchmarkConfig,
  BenchmarkSuite,
  TaskCategory,
  TaskDefinition,
  TaskFile,
} from "@atlas/core";

/**
 * Scaffold a new benchmark suite.
 *
 * Creates the directory structure and default config file at the given root.
 */
export function scaffoldSuite(root: string, config: BenchmarkConfig): BenchmarkSuite {
  mkdirSync(root, { recursive: true });

  const suite: BenchmarkSuite = {
    id: config.id,
    name: config.name,
    config,
    createdAt: new Date().toISOString(),
    status: "created",
    taskFiles: [],
  };

  writeFileSync(join(root, "benchmark.json"), JSON.stringify(config, null, 2));
  return suite;
}

/**
 * Create a starter task file from a template.
 *
 * Returns the TaskFile object. Does NOT write to disk (the caller decides).
 */
export function scaffoldTaskFile(repository: string, name: string, repoPath: string): TaskFile {
  return {
    repository,
    name,
    version: "0.0.0",
    files: 0,
    tasks: [
      starterTask("T01", "repository-understanding", repoPath),
      starterTask("T02", "file-discovery", repoPath),
      starterTask("T03", "dependency-tracing", repoPath),
    ],
  };
}

function starterTask(suffix: string, category: TaskCategory, _repoPath: string): TaskDefinition {
  const prefix = "R1";
  const prompts: Record<TaskCategory, string> = {
    "repository-understanding":
      "Explain the architecture of this repository and identify the major modules. Use the assistant tools available to you to explore the codebase before answering. Cite the specific files you inspected.",
    "file-discovery":
      "Find where the main entry point is implemented and explain how the module is structured. Use the assistant tools available to you to explore the codebase before answering. Cite the specific files you inspected.",
    "dependency-tracing":
      "Trace how the main export flows from entry point to internal modules. Identify the important files and functions involved. Use the assistant tools available to you to explore the codebase before answering. Cite the specific files you inspected.",
    "bug-investigation":
      "A user reports an issue with the library. Investigate the most likely cause by examining the relevant source files. Use the assistant tools available to you to explore the codebase before answering. Cite the specific files you inspected.",
    "feature-planning":
      "Plan how to add a new feature to this library. Identify the files, classes, interfaces, and tests that would need to change or be added. Use the assistant tools available to you to explore the codebase before answering. Cite the specific files you inspected.",
    "code-modification":
      "Write the exact code change needed to modify a core behavior. Identify precisely which files define the behavior and provide the exact code you would modify. Use the assistant tools available to you to explore the codebase before answering. Cite the specific files you inspected.",
    testing:
      "Find the existing tests that cover the main functionality and explain what behavior is currently covered. Use the assistant tools available to you to explore the codebase before answering. Cite the specific test files you inspected.",
    "cross-file-reasoning":
      "Explain how two major modules in this repository interact with each other. Use the assistant tools available to you to explore the codebase before answering. Cite the specific files you inspected.",
  };

  return {
    id: `${prefix}-${suffix}`,
    category,
    prompt: prompts[category],
    expected_files: [],
    expected_concepts: [],
    evaluation_method:
      "Manual review of final answer. Score 2 if the answer is correct and cites relevant files. 1 if partial. 0 if wrong.",
  };
}

/**
 * Load a task file from disk.
 */
export function loadTaskFile(path: string): TaskFile | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as TaskFile;
  } catch {
    return null;
  }
}

/**
 * Load the benchmark config from a suite root.
 */
export function loadConfig(suiteRoot: string): BenchmarkConfig | null {
  const p = join(suiteRoot, "benchmark.json");
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf-8")) as BenchmarkConfig;
  } catch {
    return null;
  }
}
