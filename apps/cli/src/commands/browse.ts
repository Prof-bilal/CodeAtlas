import { type BrowseInteraction, type BrowseViewport, createBrowseService } from "@prof-bilal/atlas-sdk";
import { type Command, Option } from "commander";

const NAMED_KEYS = new Set([
  "Enter",
  "Escape",
  "Tab",
  "ArrowDown",
  "ArrowUp",
  "ArrowLeft",
  "ArrowRight",
]);

interface BrowseOptions {
  readonly allowOrigin: string[];
  readonly repo?: string;
  readonly timeout?: string;
  readonly json?: boolean;
  readonly label?: string;
}

interface InteractOptions extends BrowseOptions {
  readonly click: string[];
  readonly hover: string[];
  readonly fill: string[];
  readonly press: string[];
  readonly viewport: string;
}

export function registerBrowse(program: Command): void {
  const browse = program
    .command("browse")
    .description("Observe an allowlisted website through the optional playwright-cli runtime");

  browse
    .command("snapshot <url>")
    .description("Capture a bounded DOM/accessibility snapshot")
    .addOption(originOption())
    .addOption(labelOption())
    .option("--repo <path>", "Repository root for evidence (default: current directory)")
    .option("--timeout <ms>", "Browser timeout in milliseconds", "60000")
    .option("--json", "Output as JSON")
    .action(async (url: string, options: BrowseOptions) => {
      await report(await createService(options).snapshot(url, options.label), options);
    });

  browse
    .command("screenshot <url>")
    .description("Capture one screenshot at a bounded viewport")
    .addOption(originOption())
    .addOption(labelOption())
    .option("--viewport <width>x<height>", "Viewport size", "390x844")
    .option("--repo <path>", "Repository root for evidence (default: current directory)")
    .option("--timeout <ms>", "Browser timeout in milliseconds", "60000")
    .option("--json", "Output as JSON")
    .action(async (url: string, options: BrowseOptions & { readonly viewport: string }) => {
      const viewport = parseViewport(options.viewport);
      if (viewport === null) {
        console.error("Viewport must use WIDTHxHEIGHT with positive integer dimensions.");
        process.exitCode = 1;
        return;
      }
      await report(await createService(options).screenshot(url, viewport, options.label), options);
    });

  browse
    .command("responsive <url>")
    .description("Capture screenshots at 390x844, 768x1024, and 1280x800")
    .addOption(originOption())
    .addOption(labelOption())
    .option("--repo <path>", "Repository root for evidence (default: current directory)")
    .option("--timeout <ms>", "Browser timeout in milliseconds", "60000")
    .option("--json", "Output as JSON")
    .action(async (url: string, options: BrowseOptions) => {
      await report(await createService(options).responsive(url, [], options.label), options);
    });

  browse
    .command("console <url>")
    .description("Capture browser console output")
    .addOption(originOption())
    .addOption(labelOption())
    .option("--repo <path>", "Repository root for evidence (default: current directory)")
    .option("--timeout <ms>", "Browser timeout in milliseconds", "60000")
    .option("--json", "Output as JSON")
    .action(async (url: string, options: BrowseOptions) => {
      await report(await createService(options).console(url, options.label), options);
    });

  browse
    .command("interact <url>")
    .description(
      "Perform bounded interactions (click/hover/fill/press with snapshot refs) and capture the resulting snapshot",
    )
    .addOption(originOption())
    .addOption(labelOption())
    .option("--click <ref>", "Click an element ref from a prior snapshot; repeatable", collect, [])
    .option("--hover <ref>", "Hover an element ref from a prior snapshot; repeatable", collect, [])
    .option(
      "--fill <ref>=<text>",
      "Fill a snapshot element ref with bounded text; repeatable",
      collect,
      [],
    )
    .option(
      "--press <key>",
      "Press a key: single alphanumeric char or Enter/Escape/Tab/Arrow*; repeatable",
      collect,
      [],
    )
    .option("--viewport <width>x<height>", "Viewport size", "1280x800")
    .option("--repo <path>", "Repository root for evidence (default: current directory)")
    .option("--timeout <ms>", "Browser timeout in milliseconds", "60000")
    .option("--json", "Output as JSON")
    .action(async (url: string, options: InteractOptions) => {
      const interactions = parseInteractions(options);
      if (typeof interactions !== "object") {
        console.error(interactions);
        process.exitCode = 1;
        return;
      }
      const viewport = parseViewport(options.viewport);
      if (viewport === null) {
        console.error("Viewport must use WIDTHxHEIGHT with positive integer dimensions.");
        process.exitCode = 1;
        return;
      }
      await report(
        await createService(options).interact(url, interactions, {
          viewport,
          ...(options.label === undefined ? {} : { label: options.label }),
        }),
        options,
      );
    });
}

function originOption(): Option {
  return new Option("--allow-origin <origin>", "Explicitly allow this exact URL origin; repeatable")
    .default([])
    .argParser((value: string, previous: string[]) => [...previous, value]);
}

function labelOption(): Option {
  return new Option(
    "--label <name>",
    "Path-safe evidence label ([a-zA-Z0-9._-], max 64 chars) used in evidence filenames",
  );
}

function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}

/**
 * Parse CLI flags into the fixed BrowseInteraction vocabulary. Targets are
 * snapshot element refs (untrusted page data) and stay that way: they are
 * passed through as single argv entries by the SDK, never interpolated into a
 * shell string. Returns an Error message string on invalid input.
 */
function parseInteractions(
  options: Pick<InteractOptions, "click" | "hover" | "fill" | "press">,
): readonly BrowseInteraction[] | string {
  const interactions: BrowseInteraction[] = [];
  for (const ref of options.click) {
    if (!isValidRef(ref))
      return `Invalid click ref: "${ref}". Use an element ref from a prior snapshot.`;
    interactions.push({ kind: "click", ref });
  }
  for (const ref of options.hover) {
    if (!isValidRef(ref))
      return `Invalid hover ref: "${ref}". Use an element ref from a prior snapshot.`;
    interactions.push({ kind: "hover", ref });
  }
  for (const entry of options.fill) {
    const eq = entry.indexOf("=");
    if (eq <= 0) return `Invalid --fill value: "${entry}". Expected <ref>=<text>.`;
    const ref = entry.slice(0, eq);
    const text = entry.slice(eq + 1);
    if (!isValidRef(ref))
      return `Invalid fill ref: "${ref}". Use an element ref from a prior snapshot.`;
    if (text.length === 0 || text.length > 200) return "Fill text must be 1-200 characters.";
    interactions.push({ kind: "fill", ref, text });
  }
  for (const key of options.press) {
    const isNamed = NAMED_KEYS.has(key);
    const isSingleChar = key.length === 1 && /[a-zA-Z0-9]/.test(key);
    if (!isNamed && !isSingleChar)
      return `Invalid --press key: "${key}". Use a single alphanumeric character or ${[...NAMED_KEYS].join(", ")}.`;
    interactions.push({ kind: "press", key: key as never });
  }
  if (interactions.length === 0)
    return "Provide at least one interaction: --click, --hover, --fill, or --press.";
  if (interactions.length > 12) return "At most 12 interactions per call.";
  return interactions;
}

function isValidRef(ref: string): boolean {
  return ref.length >= 1 && ref.length <= 64 && !ref.includes("\u0000");
}

function createService(options: BrowseOptions) {
  return createBrowseService({
    ...(options.repo === undefined ? {} : { repositoryPath: options.repo }),
    allowOrigins: options.allowOrigin,
    ...(options.timeout === undefined ? {} : { timeoutMs: Number(options.timeout) }),
  });
}

async function report(
  result: { readonly ok: boolean; readonly value?: unknown; readonly error?: Error },
  options: BrowseOptions,
): Promise<void> {
  if (options.json === true) {
    console.log(
      JSON.stringify(
        result.ok
          ? result
          : { ok: false, error: result.error?.message ?? "Browse operation failed." },
        null,
        2,
      ),
    );
  } else if (result.ok) {
    const value = result.value as
      | { readonly operation?: string; readonly path?: string | null; readonly output?: string }
      | readonly { readonly path?: string | null; readonly viewport?: BrowseViewport }[];
    if (Array.isArray(value)) {
      for (const item of value)
        console.log(
          `✓ ${item.viewport?.width}x${item.viewport?.height}${item.path === null || item.path === undefined ? "" : ` — ${item.path}`}`,
        );
    } else {
      const item = value as {
        readonly operation?: string;
        readonly path?: string | null;
        readonly output?: string;
      };
      console.log(
        `✓ ${item.operation ?? "browse"}${item.path === null || item.path === undefined ? "" : ` — ${item.path}`}`,
      );
      if (item.output !== undefined && item.output.length > 0) console.log(item.output);
    }
  } else {
    console.error(result.error?.message ?? "Browse operation failed.");
  }
  if (!result.ok) process.exitCode = 1;
}

function parseViewport(value: string): BrowseViewport | null {
  const match = /^(\d+)x(\d+)$/.exec(value.trim());
  if (match === null) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  return width > 0 && height > 0 && width <= 4096 && height <= 4096 ? { width, height } : null;
}
