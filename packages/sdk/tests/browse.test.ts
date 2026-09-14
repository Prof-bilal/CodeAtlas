import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { type BrowseRunner, createBrowseService } from "../src/browse";

const runner: BrowseRunner = async (_binary, args) => {
  const filenameArg = args.find((arg) => arg.startsWith("--filename="));
  if (filenameArg !== undefined)
    await writeFile(filenameArg.slice("--filename=".length), "evidence");
  return { exitCode: 0, signal: null, timedOut: false, stdout: "browser output", stderr: "" };
};

describe("browser observation service", () => {
  it("rejects invalid and non-allowlisted URLs before resolving the binary", async () => {
    let resolved = false;
    const service = createBrowseService({
      resolveBinary: () => {
        resolved = true;
        return "/bin/playwright-cli";
      },
      runner,
      allowOrigins: ["https://example.com"],
    });
    expect((await service.snapshot("not a url")).ok).toBe(false);
    expect((await service.snapshot("https://other.example/")).ok).toBe(false);
    expect(resolved).toBe(false);
  });

  it("requires playwright-cli", async () => {
    const result = await createBrowseService({
      resolveBinary: () => null,
      allowOrigins: ["https://example.com"],
    }).snapshot("https://example.com/");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain("not installed");
  });

  it("uses argument arrays and stores bounded evidence under the repository", async () => {
    const root = await mkdtemp(join(tmpdir(), "atlas-browse-"));
    const captured: string[][] = [];
    const result = await createBrowseService({
      repositoryPath: root,
      allowOrigins: ["https://example.com"],
      resolveBinary: () => "playwright-cli",
      runner: async (binary, args, cwd) => {
        captured.push([binary, ...args]);
        expect(cwd).toBe(root);
        const filename = args.find((arg) => arg.startsWith("--filename="));
        if (filename !== undefined) await writeFile(filename.slice("--filename=".length), "png");
        return { exitCode: 0, signal: null, timedOut: false, stdout: "ok", stderr: "" };
      },
    }).screenshot("https://example.com/a?x=1", { width: 390, height: 844 });

    expect(result.ok).toBe(true);
    expect(captured[0]?.includes("https://example.com/a?x=1")).toBe(true);
    expect(captured.some((call) => call.some((arg) => arg.startsWith("--filename=")))).toBe(true);
    if (result.ok) {
      expect(result.value.path).toContain(join(root, ".codeatlas", "evidence"));
      expect(await readFile(result.value.path as string, "utf8")).toBe("png");
    }
    await rm(root, { recursive: true, force: true });
  });

  it("uses the three default responsive viewports", async () => {
    const viewports: string[] = [];
    const result = await createBrowseService({
      allowOrigins: ["https://example.com"],
      resolveBinary: () => "playwright-cli",
      runner: async (_binary, args) => {
        const resizeIndex = args.indexOf("resize");
        if (resizeIndex >= 0) viewports.push(`${args[resizeIndex + 1]}x${args[resizeIndex + 2]}`);
        return { exitCode: 0, signal: null, timedOut: false, stdout: "", stderr: "" };
      },
    }).responsive("https://example.com", []);
    expect(result.ok).toBe(true);
    expect(viewports).toEqual(["390x844", "768x1024", "1280x800"]);
  });

  it("encodes interactions as argument arrays with snapshot refs and a final snapshot", async () => {
    const root = await mkdtemp(join(tmpdir(), "atlas-browse-interact-"));
    const calls: string[][] = [];
    const result = await createBrowseService({
      repositoryPath: root,
      allowOrigins: ["https://example.com"],
      resolveBinary: () => "playwright-cli",
      runner: async (_binary, args) => {
        calls.push([...args]);
        const filename = args.find((arg) => arg.startsWith("--filename="));
        if (filename !== undefined) await writeFile(filename.slice("--filename=".length), "snap");
        return { exitCode: 0, signal: null, timedOut: false, stdout: "ok", stderr: "" };
      },
    }).interact(
      "https://example.com",
      [
        { kind: "click", ref: "e12" },
        { kind: "fill", ref: "e7", text: "some text" },
        { kind: "hover", ref: "e3" },
        { kind: "press", key: "Enter" },
      ],
      { viewport: { width: 1280, height: 800 }, label: "nav-open" },
    );
    expect(result.ok).toBe(true);
    expect(calls.length).toBe(7); // open + resize + 4 interactions + snapshot
    const flat = calls.flat();
    expect(flat).toContain("click");
    expect(flat).toContain("e12");
    expect(flat).toContain("fill");
    expect(flat).toContain("some text");
    expect(flat).toContain("press");
    expect(flat).toContain("Enter");
    expect(flat.filter((arg) => arg === "snapshot")).toHaveLength(1);
    if (result.ok) {
      expect(result.value.label).toBe("nav-open");
      expect(result.value.path).toContain("nav-open");
      expect(result.value.path).toContain(join(root, ".codeatlas", "evidence"));
    }
    await rm(root, { recursive: true, force: true });
  });

  it("rejects invalid interactions and labels without spawning the browser", async () => {
    let spawned = false;
    const service = createBrowseService({
      allowOrigins: ["https://example.com"],
      resolveBinary: () => "playwright-cli",
      runner: async () => {
        spawned = true;
        return { exitCode: 0, signal: null, timedOut: false, stdout: "", stderr: "" };
      },
    });
    const empty = await service.interact("https://example.com", []);
    expect(empty.ok).toBe(false);
    expect(spawned).toBe(false);
    const tooMany = await service.interact("https://example.com", [
      ...Array.from({ length: 13 }, () => ({ kind: "click", ref: "e1" }) as const),
    ]);
    expect(tooMany.ok).toBe(false);
    expect(spawned).toBe(false);
    const badKey = await service.interact("https://example.com", [
      { kind: "press", key: "Shift" as never },
    ]);
    expect(badKey.ok).toBe(false);
    const badLabel = await service.snapshot("https://example.com", "../escape");
    expect(badLabel.ok).toBe(false);
    expect(spawned).toBe(false);
  });

  it("splits labeled evidence filenames for responsive captures", async () => {
    const paths: string[] = [];
    const result = await createBrowseService({
      allowOrigins: ["https://example.com"],
      resolveBinary: () => "playwright-cli",
      runner: async (_binary, args) => {
        const filename = args.find((arg) => arg.startsWith("--filename="));
        if (filename !== undefined) {
          paths.push(filename.slice("--filename=".length));
          await writeFile(filename.slice("--filename=".length), "png");
        }
        return { exitCode: 0, signal: null, timedOut: false, stdout: "", stderr: "" };
      },
    }).responsive("https://example.com", [], "landing");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.every((item) => item.label === "landing")).toBe(true);
      expect(paths).toHaveLength(3);
      expect(paths.every((path) => /-landing-[a-z0-9]+\.png$/.test(path))).toBe(true);
    }
  });
});
