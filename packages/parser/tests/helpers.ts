import type { SourceFile } from "@atlas/core";
import type { FilePath } from "@atlas/shared";
import type { ParsedFile } from "../src/parsed-file";
import { TypeScriptParser } from "../src/typescript/typescript-parser";

/** Build a TypeScript {@link SourceFile} for parsing. */
export function tsFile(content: string, path = "/fixture/sample.ts"): SourceFile {
  return { path: path as FilePath, language: "typescript", content };
}

/** Parse TypeScript and return the {@link ParsedFile}, throwing on failure. */
export async function parseTs(content: string, path = "/fixture/sample.ts"): Promise<ParsedFile> {
  const result = await new TypeScriptParser().parse(tsFile(content, path));
  if (!result.ok) {
    throw result.error;
  }
  return result.value;
}
