import type { CompatibilityReport } from "@atlas/core";
import { describe, expect, it } from "vitest";
import { compatibilityStateGlyph, renderCompatibilityReport } from "../src/render";

describe("compatibilityStateGlyph", () => {
  it("maps each state to its glyph", () => {
    expect(compatibilityStateGlyph("compatible")).toBe("✓");
    expect(compatibilityStateGlyph("partially-compatible")).toBe("~");
    expect(compatibilityStateGlyph("incompatible")).toBe("✗");
    expect(compatibilityStateGlyph("unknown")).toBe("?");
  });
});

describe("renderCompatibilityReport", () => {
  it("renders per-check verdicts, sub-checks, and the overall line", () => {
    const report: CompatibilityReport = {
      toolName: "Example Context Tool",
      toolVersion: "1.2.3",
      overall: "partially-compatible",
      notInstallable: false,
      checks: [
        { id: "os", label: "OS", state: "compatible", detail: "running on win32", advisory: false },
        {
          id: "runtimes",
          label: "Runtimes",
          state: "partially-compatible",
          detail: null,
          advisory: false,
          subChecks: [
            {
              id: "runtime:node",
              label: "node >=20.19.0",
              state: "compatible",
              detail: "found node (v22.14.0)",
              advisory: false,
            },
            {
              id: "runtime:python",
              label: "python >=3.11",
              state: "incompatible",
              detail: "required runtime 'python' not found on PATH",
              advisory: false,
            },
          ],
        },
      ],
    };
    const rendered = renderCompatibilityReport(report);
    expect(rendered).toContain("Tool: Example Context Tool (v1.2.3)");
    expect(rendered).toContain("✓ OS — running on win32");
    expect(rendered).toContain("~ Runtimes");
    expect(rendered).toContain("  ✓ node >=20.19.0 — found node (v22.14.0)");
    expect(rendered).toContain("  ✗ python >=3.11 — required runtime 'python' not found on PATH");
    expect(rendered).toContain("OVERALL: partially-compatible");
  });

  it("surfaces an incompatible tool as not installable in this environment", () => {
    const report: CompatibilityReport = {
      toolName: "Broken Tool",
      toolVersion: null,
      overall: "incompatible",
      notInstallable: true,
      checks: [
        { id: "os", label: "OS", state: "incompatible", detail: "requires linux", advisory: false },
      ],
    };
    expect(renderCompatibilityReport(report)).toContain(
      "OVERALL: incompatible — not installable in this environment",
    );
  });

  it("renders the unknown state with a question mark", () => {
    const report: CompatibilityReport = {
      toolName: "Mystery Tool",
      toolVersion: "0.0.0",
      overall: "unknown",
      notInstallable: false,
      checks: [
        {
          id: "runtime:go",
          label: "go >=1.22",
          state: "unknown",
          detail: "found go but its version could not be parsed",
          advisory: false,
        },
      ],
    };
    expect(renderCompatibilityReport(report)).toContain(
      "? go >=1.22 — found go but its version could not be parsed",
    );
  });
});
