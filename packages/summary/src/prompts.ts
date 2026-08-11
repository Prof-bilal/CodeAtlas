/** Maximum number of content characters fed to a model for a file summary. */
export const MAX_CONTENT_CHARS = 12_000;

/** Default instruction appended as the system prompt for JSON responses. */
export const SYSTEM_JSON_INSTRUCTION =
  "Respond with a single JSON object and nothing else. Do not wrap it in markdown fences.";

/** Placeholder values substituted into a prompt template. */
export interface PromptValues {
  readonly path?: string;
  readonly content?: string;
  readonly language?: string;
  readonly target?: string;
  readonly files?: string;
  readonly kind?: string;
}

/** Substitute `{name}` placeholders; unknown ones are left as-is. */
export function render(template: string, values: PromptValues): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = (values as Record<string, string | undefined>)[key];
    return value !== undefined ? value : match;
  });
}

/** Truncate large contents to bound prompt size. */
export function truncateContent(content: string, max = MAX_CONTENT_CHARS): string {
  if (content.length <= max) {
    return content;
  }
  return `${content.slice(0, max)}\n… (truncated)`;
}

/** Default prompt for a single-file summary. */
export const FILE_PROMPT_TEMPLATE = `Write a concise summary of the source code in {path}.

Language: {language}

\`\`\`
{content}
\`\`\`

Return a JSON object with exactly these keys:
- "overview": string — a brief summary of what the code does
- "keyPoints": array of strings — the most notable behaviors or responsibilities`;

/** Default prompt for a folder/module/project summary fed per-file summaries. */
export const SCOPE_PROMPT_TEMPLATE = `Write a {kind} summary of {target} based on these file summaries.

{files}

Return a JSON object with exactly these keys:
- "overview": string — a brief summary of what the {kind} is about
- "keyPoints": array of strings — the most important characteristics`;
