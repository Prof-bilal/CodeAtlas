/**
 * Information the framework detector uses to identify a project's framework.
 * These are cheap filesystem/lockfile signals — manifest text is read bounded,
 * never parsed into a full model.
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
  /** A `build.gradle`/`build.gradle.kts` at the project root. */
  readonly hasGradleBuild?: boolean;
  /** A `.sln`/`.csproj` at the project root (.NET). */
  readonly hasDotnetProject?: boolean;
  /** `requirements.txt` contents (bounded), or `null`. */
  readonly requirementsText?: string | null;
  /** `pyproject.toml` contents (bounded), or `null`. */
  readonly pyprojectText?: string | null;
  /** `pom.xml` contents (bounded), or `null`. */
  readonly pomText?: string | null;
  /** `build.gradle` contents (bounded), or `null`. */
  readonly gradleText?: string | null;
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
    const python =
      `${signals.requirementsText ?? ""}\n${signals.pyprojectText ?? ""}`.toLowerCase();
    if (/\bdjango\b/.test(python)) {
      return "django";
    }
    if (/\bfastapi\b/.test(python)) {
      return "fastapi";
    }
    if (/\bflask\b/.test(python)) {
      return "flask";
    }
    return "python";
  }
  if (signals.hasGoMod) {
    return "go";
  }
  if (signals.hasCargoToml) {
    return "rust";
  }
  if (signals.hasPomXml || signals.hasGradleBuild === true) {
    const java = `${signals.pomText ?? ""}\n${signals.gradleText ?? ""}`.toLowerCase();
    if (java.includes("spring-boot") || java.includes("springframework")) {
      return "spring";
    }
    return signals.hasGradleBuild === true ? "gradle" : "maven";
  }
  if (signals.hasDotnetProject === true) {
    return "dotnet";
  }
  if (signals.hasGemfile) {
    return "ruby";
  }
  if (hasAnyNodeDependency) {
    return "node.js";
  }

  return null;
}
