import { describe, expect, it } from "vitest";
import { type FrameworkSignals, detectFramework } from "../src/framework";

const base: FrameworkSignals = {
  packageJson: null,
  hasTsconfig: false,
  hasNextBuildFolder: false,
  hasRequirementsFile: false,
  hasPyprojectFile: false,
  hasGoMod: false,
  hasCargoToml: false,
  hasPomXml: false,
  hasGemfile: false,
};

function signals(overrides: Partial<FrameworkSignals> = {}): FrameworkSignals {
  return { ...base, ...overrides };
}

describe("detectFramework", () => {
  it("detects next.js from dependencies", () => {
    const result = detectFramework(signals({ packageJson: { dependencies: { next: "^14.0.0" } } }));
    expect(result).toBe("next.js");
  });

  it("detects react from dependencies", () => {
    const result = detectFramework(
      signals({ packageJson: { dependencies: { react: "^18.0.0" } } }),
    );
    expect(result).toBe("react");
  });

  it("detects next.js from a .next build folder", () => {
    expect(detectFramework(signals({ hasNextBuildFolder: true }))).toBe("next.js");
  });

  it("returns node.js for a plain package.json", () => {
    const result = detectFramework(signals({ packageJson: { name: "demo", scripts: {} } }));
    expect(result).toBe("node.js");
  });

  it("detects other ecosystems from lockfile markers", () => {
    expect(detectFramework(signals({ hasPyprojectFile: true }))).toBe("python");
    expect(detectFramework(signals({ hasGoMod: true }))).toBe("go");
    expect(detectFramework(signals({ hasCargoToml: true }))).toBe("rust");
    expect(detectFramework(signals({ hasPomXml: true }))).toBe("maven");
    expect(detectFramework(signals({ hasGemfile: true }))).toBe("ruby");
  });

  it("detects Python, JVM, and .NET frameworks from manifest contents", () => {
    expect(
      detectFramework(signals({ hasRequirementsFile: true, requirementsText: "Django==5.0" })),
    ).toBe("django");
    expect(
      detectFramework(signals({ hasRequirementsFile: true, requirementsText: "fastapi\nuvicorn" })),
    ).toBe("fastapi");
    expect(detectFramework(signals({ hasPyprojectFile: true, pyprojectText: "[flask]" }))).toBe(
      "flask",
    );
    expect(
      detectFramework(
        signals({ hasPomXml: true, pomText: "<artifactId>spring-boot-starter</artifactId>" }),
      ),
    ).toBe("spring");
    expect(detectFramework(signals({ hasGradleBuild: true }))).toBe("gradle");
    expect(detectFramework(signals({ hasDotnetProject: true }))).toBe("dotnet");
  });

  it("returns null when nothing is detected", () => {
    expect(detectFramework(signals())).toBeNull();
  });
});
