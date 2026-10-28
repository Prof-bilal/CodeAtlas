// Exercises the production tarball outside the workspace, with no provider or
// credentials. Offline by default; --online explicitly allows registry access.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { createRequire } from "node:module";

const run = promisify(execFile);
const root = fileURLToPath(new URL("../", import.meta.url));
const manifest = JSON.parse(await readFile(join(root, "apps/cli/package.json"), "utf8"));
assert.match(manifest.version, /^\d+\.\d+\.\d+-beta\.\d+$/);
assert.equal(manifest.publishConfig.tag, "beta");
const parent = await mkdtemp(join(tmpdir(), "atlas-release-"));
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
try {
  console.log(`Packing CLI ${manifest.version}`);
  await run(pnpm, ["pack", "--pack-destination", parent], {
    cwd: join(root, "apps/cli"),
    timeout: 60000,
    maxBuffer: 4 * 1024 * 1024,
  });
  const install = join(parent, "installed");
  const repo = join(parent, "repo");
  await mkdir(install);
  await mkdir(repo);
  await writeFile(join(install, "package.json"), JSON.stringify({ private: true }));
  const tarball = join(parent, `${manifest.name}-${manifest.version}.tgz`);
  console.log(
    process.argv.includes("--online")
      ? "Installing from a cold registry store"
      : "Installing from the offline store",
  );
  await run(
    pnpm,
    [
      "add",
      tarball,
      "--prod",
      "--ignore-scripts",
      "--no-lockfile",
      ...(process.argv.includes("--online")
        ? ["--store-dir", join(parent, "cold-store")]
        : ["--offline"]),
    ],
    {
      cwd: install,
      timeout: 120000,
      maxBuffer: 4 * 1024 * 1024,
    },
  );
  const entry = resolve(install, "node_modules", manifest.name, "dist/index.js");
  console.log("Checking installed CLI, parsers and Skills");
  const cli = async (args, exitCode = 0) => {
    try {
      const result = await run(process.execPath, [entry, ...args], {
        cwd: repo,
        timeout: 60000,
        maxBuffer: 4 * 1024 * 1024,
        env: { ...process.env, ATLAS_ROOT: repo },
      });
      assert.equal(exitCode, 0, `Expected failure: ${args.join(" ")}`);
      return result.stdout;
    } catch (error) {
      if (exitCode !== 0 && error.code === exitCode) return error.stdout;
      throw error;
    }
  };
  assert.equal((await cli(["--version"])).trim(), manifest.version);
  assert.match(await cli(["prove", "--help"]), /begin/);
  await writeFile(join(repo, "math.ts"), "export const double = (n: number) => n * 2;\n");
  await writeFile(join(repo, "math.py"), "def python_double(n):\n    return n * 2\n");
  await cli(["init", "--repo", repo, "--tools", "none", "--json"]);
  const search = JSON.parse(await cli(["search", "python_double", "--json"]));
  assert.ok(
    search.some((hit) => hit.kind === "symbol" && hit.title.includes("python_double")),
    "Python symbol must be parsed, not merely matched as source text",
  );
  assert.equal(JSON.parse(await cli(["skills", "--builtin", "--json"])).length, 13);
  const input = join(parent, "change.json");
  await writeFile(
    input,
    JSON.stringify({
      goal: "No literal JWT",
      authorizedPaths: ["."],
      proposals: [
        {
          key: "absence",
          kind: "ProofObligation",
          statement: "JWT absent",
          minimumLevel: 1,
          action: { kind: "text-absent", paths: ["."], target: "JWT" },
        },
        {
          key: "requirement",
          kind: "Requirement",
          statement: "JWT absent",
          minimumLevel: 1,
          dependsOn: ["absence"],
        },
      ],
    }),
  );
  const started = JSON.parse(await cli(["prove", "begin", "--input", input]));
  const id = started.session.id;
  assert.equal(JSON.parse(await cli(["prove", id], 1)).completion, "not-proven");
  await cli(["prove", "verify", id, "--node", started.session.nodes[0].id]);
  assert.equal(JSON.parse(await cli(["prove", id])).completion, "proven");
  const goalInput = join(parent, "goal.json");
  await writeFile(
    goalInput,
    JSON.stringify({
      schemaVersion: 1,
      goal: "No literal JWT",
      desiredOutcomes: [
        {
          key: "no-jwt",
          statement: "No literal JWT remains in the repository",
          priority: "MUST",
          criterionKeys: ["absence"],
        },
      ],
      criteria: [
        {
          key: "absence",
          statement: "Literal JWT is absent from the repository",
          assertion: "literal-absence",
          outcomeKeys: ["no-jwt"],
          evidenceKinds: ["text-absent"],
        },
      ],
      preserveCandidates: [],
      forbiddenCandidates: [],
      nonGoals: [],
      openQuestions: [],
      limitations: ["Release smoke fixture."],
    }),
  );
  const adopted = JSON.parse(await cli(["prove", "adopt", id, "--input", goalInput]));
  assert.equal(adopted.session.goalContract?.criteria[0]?.key, "absence");
  await cli(["prove", "verify", id, "--node", started.session.nodes[0].id]);
  const goalReceipt = JSON.parse(await cli(["prove", id, "--require-goal"]));
  assert.equal(goalReceipt.goalStatus, "SATISFIED");
  await writeFile(join(repo, "math.ts"), "export const JWT = 'legacy';\n");
  assert.equal(JSON.parse(await cli(["prove", id], 1)).completion, "not-proven");
  await cli(["prove", id, "--require-goal"], 1);

  // Drive the actual installed CLI stdio transport, not an in-memory server.
  const require = createRequire(join(root, "packages/mcp/package.json"));
  const { Client } = await import(require.resolve("@modelcontextprotocol/sdk/client/index.js"));
  const { StdioClientTransport } = await import(
    require.resolve("@modelcontextprotocol/sdk/client/stdio.js")
  );
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [entry, "mcp", "--root", repo, "--profile", "proof"],
    stderr: "pipe",
  });
  const client = new Client({ name: "release-smoke", version: manifest.version });
  try {
    await client.connect(transport);
    assert.equal(client.getServerVersion().version, manifest.version);
    const tools = (await client.listTools()).tools.map((t) => t.name).sort();
    assert.deepEqual(
      tools,
      [
        "atlas_begin_change",
        "atlas_understand",
        "atlas_context",
        "atlas_check",
        "atlas_status",
        "atlas_verify",
        "atlas_prove",
      ].sort(),
    );
    const result = await client.callTool({ name: "atlas_prove", arguments: { changeId: id } });
    assert.match(JSON.stringify(result), /not-proven/);
  } finally {
    await client.close();
    await transport.close();
  }
  console.log(
    `PASS packed CLI ${manifest.version}: install, Python WASM, 13 Skills, proof invalidation, goal lifecycle, MCP stdio`,
  );
} finally {
  // Only the directory created by this process is removed, never project state.
  await rm(parent, { recursive: true, force: true });
}
