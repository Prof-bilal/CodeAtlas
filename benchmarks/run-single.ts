import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const repoName = process.argv[2];
if (!repoName) {
  console.error("Usage: node --experimental-strip-types benchmarks/run-single.ts <repo-name>");
  console.error("Available: small-app, medium-api, monorepo, legacy, large-project");
  process.exit(1);
}

const REPO_MAP: Record<string, string> = {
  "small-app": "01-small-app",
  "medium-api": "02-medium-api",
  "monorepo": "03-monorepo",
  "legacy": "04-legacy",
  "large-project": "05-large-project",
};

const repoDir = REPO_MAP[repoName];
if (!repoDir) {
  console.error(`Unknown repo: ${repoName}`);
  process.exit(1);
}

const REPO_PATH = path.resolve(__dirname, "..", "benchmark-repos", repoDir);
const RESULTS_DIR = path.join(__dirname, "results");

function run(cmd: string): { output: string; ms: number } {
  const start = performance.now();
  try {
    const output = execSync(cmd, {
      encoding: "utf-8",
      timeout: 300_000,
      stdio: ["pipe", "pipe", "pipe"],
      cwd: path.resolve(__dirname, ".."),
    });
    return { output, ms: performance.now() - start };
  } catch (err: any) {
    return { output: err.stdout || err.stderr || err.message, ms: performance.now() - start };
  }
}

function parseJson<T = any>(raw: string): T | null {
  try { return JSON.parse(raw) as T; } catch { return null; }
}

function countFiles(dir: string): number {
  if (!fs.existsSync(dir)) return 0;
  let n = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    n += e.isDirectory() ? countFiles(path.join(dir, e.name)) : 1;
  }
  return n;
}

function countLines(dir: string): number {
  if (!fs.existsSync(dir)) return 0;
  let n = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) n += countLines(full);
    else if (/\.(ts|tsx|js|jsx|json|md)$/.test(e.name)) {
      try { n += fs.readFileSync(full, "utf-8").split("\n").length; } catch {}
    }
  }
  return n;
}

function dirSize(dir: string): number {
  if (!fs.existsSync(dir)) return 0;
  let s = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    s += e.isDirectory() ? dirSize(full) : fs.statSync(full).size;
  }
  return s;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function searchFilesReturned(output: string): number {
  const parsed = parseJson<any>(output);
  if (!parsed) return 0;
  if (Array.isArray(parsed)) return parsed.length;
  if (parsed.items) return parsed.items.length;
  if (parsed.hits) return parsed.hits.length;
  return 0;
}

// Tasks for this repo
const TASKS: Record<string, { cmd: string; desc: string; cat: string }[]> = {
  "small-app": [
    { cmd: 'atlas search "authenticate login register" --repo "{repo}" --json', desc: "Find authentication", cat: "search" },
    { cmd: 'atlas search "createUser register" --repo "{repo}" --json', desc: "Find user creation", cat: "search" },
    { cmd: 'atlas explain src/app.ts --repo "{repo}" --json', desc: "Explain request flow", cat: "explain" },
    { cmd: 'atlas context build "add GET /api/users endpoint" --repo "{repo}" --json', desc: "Add endpoint context", cat: "context" },
    { cmd: 'atlas search "auth test" --repo "{repo}" --json', desc: "Find auth tests", cat: "search" },
  ],
  "medium-api": [
    { cmd: 'atlas search "authenticate login JWT" --repo "{repo}" --json', desc: "Find auth flow", cat: "search" },
    { cmd: 'atlas search "payment charge stripe" --repo "{repo}" --json', desc: "Trace payment", cat: "search" },
    { cmd: 'atlas search "role permission guard" --repo "{repo}" --json', desc: "Find authz middleware", cat: "search" },
    { cmd: 'atlas context build "add POST /api/v2/webhooks endpoint" --repo "{repo}" --json', desc: "Add endpoint context", cat: "context" },
    { cmd: 'atlas context build "fix payment amount validation" --repo "{repo}" --json', desc: "Fix validation bug", cat: "context" },
    { cmd: 'atlas search "payment test" --repo "{repo}" --json', desc: "Find payment tests", cat: "search" },
  ],
  "monorepo": [
    { cmd: 'atlas search "authenticate login" --repo "{repo}" --json', desc: "Find auth impl", cat: "search" },
    { cmd: 'atlas search "User interface type" --repo "{repo}" --json', desc: "Find shared user type", cat: "search" },
    { cmd: 'atlas explain packages/shared/src/types.ts --repo "{repo}" --json', desc: "Explain shared types", cat: "explain" },
    { cmd: 'atlas search "payment validation" --repo "{repo}" --json', desc: "Find payment validation", cat: "search" },
    { cmd: 'atlas explain packages/shared/src/utils.ts --repo "{repo}" --json', desc: "Explain shared utils", cat: "explain" },
    { cmd: 'atlas search "test shared" --repo "{repo}" --json', desc: "Find shared tests", cat: "search" },
  ],
  "legacy": [
    { cmd: 'atlas search "authenticateUserV2 current" --repo "{repo}" --json', desc: "Find active auth", cat: "search" },
    { cmd: 'atlas search "deprecated legacy" --repo "{repo}" --json', desc: "Find deprecated code", cat: "search" },
    { cmd: 'atlas explain src/authenticateUser.ts --repo "{repo}" --json', desc: "Explain auth wrapper", cat: "explain" },
    { cmd: 'atlas search "payment current active" --repo "{repo}" --json', desc: "Find active payment", cat: "search" },
    { cmd: 'atlas search "authenticate payment user" --repo "{repo}" --json', desc: "Find duplicates", cat: "search" },
    { cmd: 'atlas explain src/moduleA.ts --repo "{repo}" --json', desc: "Explain dependency cycle", cat: "explain" },
  ],
  "large-project": [
    { cmd: 'atlas search "authenticate login" --repo "{repo}" --json', desc: "Find auth", cat: "search" },
    { cmd: 'atlas search "User interface type definition" --repo "{repo}" --json', desc: "Find shared types", cat: "search" },
    { cmd: 'atlas context build "trace payment from API to database" --repo "{repo}" --json', desc: "Trace payment flow", cat: "context" },
    { cmd: 'atlas explain packages/payments --repo "{repo}" --json', desc: "Explain payments pkg", cat: "explain" },
    { cmd: 'atlas explain packages/shared --repo "{repo}" --json', desc: "Explain shared pkg", cat: "explain" },
    { cmd: 'atlas search "webhook handler" --repo "{repo}" --json', desc: "Find webhook handler", cat: "search" },
  ],
};

async function main() {
  console.log(`Benchmarking: ${repoName} (${repoDir})`);
  console.log(`Path: ${REPO_PATH}`);
  console.log("");

  if (!fs.existsSync(REPO_PATH)) {
    console.error(`Repository not found: ${REPO_PATH}`);
    process.exit(1);
  }

  fs.mkdirSync(RESULTS_DIR, { recursive: true });

  const files = countFiles(REPO_PATH);
  const lines = countLines(REPO_PATH);
  console.log(`Profile: ${files} files, ${lines} lines`);

  // Scan
  console.log("\n[1/4] Running initial scan...");
  const scan1 = run(`atlas init --repo "${REPO_PATH}" --json`);
  const scan1Parsed = parseJson<any>(scan1.output);
  console.log(`  First scan: ${Math.round(scan1.ms)}ms`);

  console.log("\n[2/4] Running incremental update...");
  const scan2 = run(`atlas update --repo "${REPO_PATH}" --json`);
  console.log(`  Incremental: ${Math.round(scan2.ms)}ms`);

  // Tasks
  console.log("\n[3/4] Running benchmark tasks...");
  const tasks = TASKS[repoName] || [];
  const taskResults = [];

  for (const task of tasks) {
    const cmd = task.cmd.replace("{repo}", REPO_PATH);
    console.log(`  > ${task.desc}...`);
    const result = run(cmd);
    const parsed = parseJson<any>(result.output);
    let filesReturned = 0;
    if (Array.isArray(parsed)) filesReturned = parsed.length;
    else if (parsed?.items) filesReturned = parsed.items.length;
    else if (parsed?.hits) filesReturned = parsed.hits.length;
    else if (parsed?.symbols || parsed?.files) filesReturned = (parsed.symbols?.length || 0) + (parsed.files?.length || 0);

    taskResults.push({
      category: task.cat,
      description: task.desc,
      codeatlasLatencyMs: Math.round(result.ms),
      filesReturned,
      contextTokens: estimateTokens(result.output),
      correct: filesReturned > 0,
    });
    console.log(`    ${filesReturned} results, ${Math.round(result.ms)}ms`);
  }

  // Freshness
  console.log("\n[4/4] Running freshness checks...");
  const testFile = path.join(REPO_PATH, "BENCHMARK_FRESHNESS_TEST.txt");
  fs.writeFileSync(testFile, "test marker");
  const addSearch = run(`atlas search "BENCHMARK_FRESHNESS_TEST" --repo "${REPO_PATH}" --json`);
  const addDetected = searchFilesReturned(addSearch.output) > 0;

  fs.writeFileSync(testFile, "modified content");
  run(`atlas update --repo "${REPO_PATH}" --json`);

  fs.unlinkSync(testFile);
  run(`atlas update --repo "${REPO_PATH}" --json`);

  const indexSize = dirSize(path.join(REPO_PATH, ".codeatlas"));

  const result = {
    repository: repoName,
    repoDir,
    profile: { files, lines },
    scan: {
      firstScanMs: Math.round(scan1.ms),
      incrementalScanMs: Math.round(scan2.ms),
      filesIndexed: scan1Parsed?.files ?? 0,
      symbolsIndexed: scan1Parsed?.symbols ?? 0,
      dependenciesIndexed: scan1Parsed?.dependencies ?? 0,
    },
    tasks: taskResults,
    freshness: { addDetected },
    memory: { indexSizeBytes: indexSize },
  };

  const outPath = path.join(RESULTS_DIR, `${repoName}.json`);
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
  console.log(`\nResults saved to ${outPath}`);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
