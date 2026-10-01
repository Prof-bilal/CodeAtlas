/** Reproducible offline evidence capture. No provider calls or real credentials. */
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createCli } from "../apps/cli/src/cli";
import { denyFilter, indexProject } from "../packages/sdk/src/index";

const root = resolve(import.meta.dirname, "..");
const evidence = resolve(root, ".release/beta-audit");
const fixture = resolve(evidence, "demo-repo");
await mkdir(fixture, { recursive: true });
await writeFile(resolve(fixture, "package.json"), '{"name":"atlas-demo","private":true}\n');
await writeFile(
  resolve(fixture, "auth.ts"),
  "export function authenticate(user: string): boolean {\n  return user.length > 0;\n}\n",
);
await writeFile(
  resolve(fixture, "app.ts"),
  'import { authenticate } from "./auth";\nexport function login(user: string) {\n  return authenticate(user) ? "Welcome" : "Denied";\n}\n',
);
await writeFile(
  resolve(fixture, "auth.test.ts"),
  'import { authenticate } from "./auth";\nexport const example = authenticate("Ada");\n',
);

interface Capture {
  readonly command: string;
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}
const captures: Capture[] = [];
const originalRoot = process.env.ATLAS_ROOT;
process.env.ATLAS_ROOT = fixture;
const cli = createCli();
function commandTree(command: ReturnType<typeof createCli>): unknown {
  return {
    name: command.name(),
    aliases: command.aliases(),
    description: command.description(),
    help: command.helpInformation(),
    children: command.commands.map(commandTree),
  };
}
await writeFile(resolve(evidence, "commands.json"), JSON.stringify(commandTree(cli), null, 2));

const tasks: readonly (readonly string[])[] = [
  ["scan", "--json"],
  ["init", "--tools", "none", "--json"],
  ["search", "authenticate", "--json"],
  ["explain", "auth.ts", "--json"],
  ["ask", "How does authenticate work?", "--json"],
  ["context", "build", "Explain authenticate", "--max-tokens-total", "2000", "--json"],
  ["context", "export", "Explain authenticate", "--for", "opencode", "--no-inject", "--json"],
  ["update", "--json"],
  ["skills", "list", "--builtin", "--json"],
  ["skills", "validate", "systematic-debugging", "--builtin", "--json"],
  ["tools", "categories", "--json"],
  ["tools", "search", "opencode", "--json"],
  ["setup", "--dry-run", "--json"],
  ["usage", "summary", "--json"],
  ["metrics", "show", "--json"],
  ["sessions", "list"],
];
try {
  for (const args of tasks) {
    console.error(`Capturing atlas ${args.join(" ")}`);
    const out: string[] = [];
    const err: string[] = [];
    const log = console.log;
    const error = console.error;
    console.log = (...values: unknown[]) => out.push(values.map(String).join(" "));
    console.error = (...values: unknown[]) => err.push(values.map(String).join(" "));
    process.exitCode = 0;
    try {
      await createCli().parseAsync(["node", "atlas", ...args]);
      captures.push({
        command: `atlas ${args.join(" ")}`,
        exitCode: Number(process.exitCode ?? 0),
        stdout: out.join("\n").replaceAll(fixture, "demo-repo"),
        stderr: err.join("\n").replaceAll(fixture, "demo-repo"),
      });
      await writeFile(resolve(evidence, "captures.json"), JSON.stringify(captures, null, 2));
    } finally {
      console.log = log;
      console.error = error;
    }
  }
} finally {
  // biome-ignore lint/performance/noDelete: must fully remove the env var; assigning undefined stores the string "undefined".
  if (originalRoot === undefined) delete process.env["ATLAS_ROOT"];
  else process.env.ATLAS_ROOT = originalRoot;
  process.exitCode = 0;
}
await writeFile(resolve(evidence, "captures.json"), JSON.stringify(captures, null, 2));
// Synthetic filenames/content only: no actual secret file is read.
await writeFile(
  resolve(evidence, "deny-filter.json"),
  JSON.stringify(
    [".env", ".env.local", ".env.production.local", ".envrc", "credentials.json"].map((path) => ({
      path,
      result: denyFilter(path, "synthetic harmless placeholder"),
    })),
    null,
    2,
  ),
);
const fullIndex = await indexProject({
  repositoryPath: root,
  dbPath: resolve(evidence, "root-context.db"),
});
await writeFile(resolve(evidence, "root-index.json"), JSON.stringify(fullIndex, null, 2));
console.log(`Captured ${captures.length} commands; full-repository index: ${fullIndex.ok}`);
