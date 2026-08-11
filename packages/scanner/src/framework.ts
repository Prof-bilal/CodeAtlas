/**
 * Information the framework detector uses to identify a project's framework.
 * These are cheap filesystem/lockfile signals — no parsing of file contents.
 */
export interface FrameworkSignals {
  /** Parsed `package.json` contents, or `null` when absent/unreadable. */
  readonly packageJson: Readonly<Record<string, unknown>> | null;
  readonly hasTsconfig: boolean;
  readonly hasNextBuildFolder: boolean;
  readonly hasRequirementsFile: boolean;
  readonly hasPyprojectFile: boolean;
  readonly hasGoMod: boolean;
  readonly hasCargoToml: boolean;
  readonly hasPomXml: boolean;
  readonly hasGemfile: boolean;
}

/** Known framework identifiers, in priority order. */
const FRAMEWORK_MARKERS: Readonly<Record<string, string>> = {
  next: "next.js",
  nuxt: "nuxt",
  nuxt3: "nuxt",
  gatsby: "gatsby",
  "@angular/core": "angular",
  vue: "vue",
  svelte: "svelte",
  "@sveltejs/kit": "svelte",
  "solid-js": "solid",
  react: "react",
  "@nestjs/core": "nestjs",
  express: "express",
  fastify: "fastify",
  hapi: "hapi",
  preact: "preact",
  remix: "remix",
};

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null;
}

/**
 * Detect the framework of a project from structural signals.
 *
 * @param signals - Filesystem/lockfile signals gathered by the scanner.
 * @returns A framework identifier string (e.g. `"next.js"`, `"react"`,
 *   `"express"`), `"node.js"` for plain Node projects, or `null` when the
 *   framework cannot be determined.
 */
export function detectFramework(signals: FrameworkSignals): string | null {
  const dependencies: Record<string, unknown> = {};
  if (isRecord(signals.packageJson)) {
    const deps = signals.packageJson["dependencies"];
    const devDeps = signals.packageJson["devDependencies"];
    if (isRecord(deps)) {
      Object.assign(dependencies, deps);
    }
    if (isRecord(devDeps)) {
      Object.assign(dependencies, devDeps);
    }
  }

  for (const [marker, framework] of Object.entries(FRAMEWORK_MARKERS)) {
    if (marker in dependencies) {
      return framework;
    }
  }

  if (signals.hasNextBuildFolder) {
    return "next.js";
  }

  const hasAnyNodeDependency = Object.keys(dependencies).length > 0 || signals.packageJson !== null;

  if (signals.hasPyprojectFile || signals.hasRequirementsFile) {
    return "python";
  }
  if (signals.hasGoMod) {
    return "go";
  }
  if (signals.hasCargoToml) {
    return "rust";
  }
  if (signals.hasPomXml) {
    return "java";
  }
  if (signals.hasGemfile) {
    return "ruby";
  }
  if (hasAnyNodeDependency) {
    return "node.js";
  }

  return null;
}
