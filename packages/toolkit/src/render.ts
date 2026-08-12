import type { CompatibilityReport, CompatibilityState } from "@atlas/core";

/** The glyph used to render each {@link CompatibilityState}. */
export function compatibilityStateGlyph(state: CompatibilityState): string {
  switch (state) {
    case "compatible":
      return "✓";
    case "partially-compatible":
      return "~";
    case "incompatible":
      return "✗";
    case "unknown":
      return "?";
  }
}

/**
 * Render a compatibility report like the design contract (AGENT_TOOLKIT §6):
 * one `✓ / ~ / ✗ / ?` line per check (sub-checks indented under their group),
 * then the overall verdict. An `incompatible` tool is surfaced explicitly as
 * **not installable in this environment** — never silently skipped.
 */
export function renderCompatibilityReport(report: CompatibilityReport): string {
  const lines: string[] = [];
  const version = report.toolVersion === null ? "" : ` (v${report.toolVersion})`;
  lines.push(`Tool: ${report.toolName}${version}`);
  for (const check of report.checks) {
    if (check.subChecks !== undefined && check.subChecks.length > 0) {
      lines.push(`${compatibilityStateGlyph(check.state)} ${check.label}`);
      for (const sub of check.subChecks) {
        lines.push(`  ${compatibilityStateGlyph(sub.state)} ${sub.label}${subDetail(sub)}`);
      }
    } else {
      lines.push(`${compatibilityStateGlyph(check.state)} ${check.label}${subDetail(check)}`);
    }
  }
  lines.push(
    report.notInstallable
      ? `OVERALL: ${report.overall} — not installable in this environment`
      : `OVERALL: ${report.overall}`,
  );
  return lines.join("\n");
}

function subDetail(check: { readonly detail: string | null }): string {
  return check.detail === null ? "" : ` — ${check.detail}`;
}
