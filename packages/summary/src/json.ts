import type { SummaryContent } from "@atlas/core";
import type { Result } from "@atlas/shared";
import { fail, ok } from "@atlas/shared";

/** Thrown (as a `Result` failure) when a model's output is not a valid summary. */
export class SummaryParseError extends Error {
  public readonly detail: string;

  public constructor(detail: string) {
    super(`Could not parse summary JSON: ${detail}`);
    this.name = "SummaryParseError";
    this.detail = detail;
  }
}

/** Parse a model's JSON output into a structured {@link SummaryContent}. */
export function parseSummaryContent(raw: string): Result<SummaryContent> {
  const text = stripCodeFence(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return fail(new SummaryParseError("model output was not valid JSON"));
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return fail(new SummaryParseError("model output was not a JSON object"));
  }
  const record = parsed as Record<string, unknown>;
  const overview = record["overview"];
  if (typeof overview !== "string") {
    return fail(new SummaryParseError('missing string field "overview"'));
  }
  const keyPointsValue = record["keyPoints"] ?? [];
  if (!Array.isArray(keyPointsValue) || keyPointsValue.some((k) => typeof k !== "string")) {
    return fail(new SummaryParseError('"keyPoints" must be an array of strings'));
  }
  return ok({ overview, keyPoints: keyPointsValue as string[] });
}

/** Remove a surrounding ```json ... ``` code fence, if present. */
function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(trimmed);
  return fenced === null ? trimmed : fenced[1];
}
