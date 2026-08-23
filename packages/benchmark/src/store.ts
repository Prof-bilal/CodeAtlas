import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type {
  BenchmarkReport,
  BenchmarkSuite,
  BenchmarkTaskResult,
  SuiteStatus,
  TaskFile,
} from "@atlas/core";

/**
 * JSON-backed persistence for benchmark data.
 *
 * Layout under the benchmark root (typically `.codeatlas/benchmarks/`):
 *   suites/<suite-id>.json                    — suite metadata
 *   suites/<suite-id>/tasks/<taskId>-<mode>.json — per-task results
 *   suites/<suite-id>/raw-results.json        — aggregated results
 *   suites/<suite-id>/report.md               — generated report
 *   task-files/<filename>.json                — copied task definitions
 */
export class BenchmarkStore {
  private readonly root: string;

  public constructor(root: string) {
    this.root = root;
  }

  // -----------------------------------------------------------------------
  // Suites
  // -----------------------------------------------------------------------

  public saveSuite(suite: BenchmarkSuite): void {
    const p = this.suitePath(suite.id);
    this.writeJson(p, suite);
  }

  public loadSuite(suiteId: string): BenchmarkSuite | null {
    const p = this.suitePath(suiteId);
    if (!existsSync(p)) return null;
    return this.readJson<BenchmarkSuite>(p);
  }

  public listSuites(): BenchmarkSuite[] {
    const dir = join(this.root, "suites");
    if (!existsSync(dir)) return [];
    const entries = readdirSync(dir, { withFileTypes: true });
    const suites: BenchmarkSuite[] = [];
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const p = join(dir, e.name, "suite.json");
      if (!existsSync(p)) continue;
      try {
        suites.push(this.readJson<BenchmarkSuite>(p));
      } catch {
        // skip corrupted files
      }
    }
    return suites.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  public updateSuiteStatus(suiteId: string, status: SuiteStatus): void {
    const suite = this.loadSuite(suiteId);
    if (suite === null) return;
    this.saveSuite({ ...suite, status });
  }

  // -----------------------------------------------------------------------
  // Task results
  // -----------------------------------------------------------------------

  public saveTaskResult(suiteId: string, result: BenchmarkTaskResult): void {
    const dir = this.suiteTasksDir(suiteId);
    const file = `${result.taskId}-${result.mode}.json`;
    this.writeJson(join(dir, file), result);
  }

  public loadTaskResult(suiteId: string, taskId: string, mode: string): BenchmarkTaskResult | null {
    const dir = this.suiteTasksDir(suiteId);
    const file = join(dir, `${taskId}-${mode}.json`);
    if (!existsSync(file)) return null;
    return this.readJson<BenchmarkTaskResult>(file);
  }

  public listTaskResults(suiteId: string): BenchmarkTaskResult[] {
    const dir = this.suiteTasksDir(suiteId);
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => this.readJson<BenchmarkTaskResult>(join(dir, f)));
  }

  // -----------------------------------------------------------------------
  // Task files (definitions)
  // -----------------------------------------------------------------------

  public saveTaskFile(taskFile: TaskFile, filename: string): void {
    const dir = join(this.root, "task-files");
    mkdirSync(dir, { recursive: true });
    this.writeJson(join(dir, filename), taskFile);
  }

  public loadTaskFile(filename: string): TaskFile | null {
    const p = join(this.root, "task-files", filename);
    if (!existsSync(p)) return null;
    return this.readJson<TaskFile>(p);
  }

  public listTaskFiles(): TaskFile[] {
    const dir = join(this.root, "task-files");
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => this.readJson<TaskFile>(join(dir, f)));
  }

  // -----------------------------------------------------------------------
  // Raw results
  // -----------------------------------------------------------------------

  public saveRawResults(suiteId: string, data: unknown): void {
    const dir = this.suiteDir(suiteId);
    mkdirSync(dir, { recursive: true });
    this.writeJson(join(dir, "raw-results.json"), data);
  }

  public loadRawResults(suiteId: string): unknown | null {
    const p = join(this.suiteDir(suiteId), "raw-results.json");
    if (!existsSync(p)) return null;
    return this.readJson<unknown>(p);
  }

  // -----------------------------------------------------------------------
  // Reports
  // -----------------------------------------------------------------------

  public saveReport(report: BenchmarkReport): void {
    const dir = this.suiteDir(report.suiteId);
    mkdirSync(dir, { recursive: true });
    const ext = report.format === "json" ? "json" : "md";
    this.writeJson(join(dir, `report.${ext}`), report);
  }

  public loadReport(
    suiteId: string,
    format: "markdown" | "json" = "markdown",
  ): BenchmarkReport | null {
    const ext = format === "json" ? "json" : "md";
    const p = join(this.suiteDir(suiteId), `report.${ext}`);
    if (!existsSync(p)) return null;
    return this.readJson<BenchmarkReport>(p);
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  private suiteDir(suiteId: string): string {
    return join(this.root, "suites", suiteId);
  }

  private suitePath(suiteId: string): string {
    return join(this.suiteDir(suiteId), "suite.json");
  }

  private suiteTasksDir(suiteId: string): string {
    return join(this.suiteDir(suiteId), "tasks");
  }

  private writeJson(file: string, data: unknown): void {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(data, null, 2));
  }

  private readJson<T>(file: string): T {
    return JSON.parse(readFileSync(file, "utf-8")) as T;
  }
}
