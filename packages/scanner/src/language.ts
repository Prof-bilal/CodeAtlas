/**
 * Maps a lowercase file extension to the display name of its language.
 * This drives language detection across the whole CodeAtlas pipeline.
 */
export const LANGUAGE_BY_EXTENSION: Readonly<Record<string, string>> = {
  ts: "typescript",
  tsx: "typescript",
  mts: "typescript",
  cts: "typescript",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  py: "python",
  go: "go",
  rs: "rust",
  java: "java",
  c: "c",
  h: "c",
  cpp: "c++",
  cc: "c++",
  cxx: "c++",
  hpp: "c++",
  cs: "csharp",
  rb: "ruby",
  php: "php",
  swift: "swift",
  kt: "kotlin",
  kts: "kotlin",
  html: "html",
  htm: "html",
  css: "css",
  scss: "scss",
  sass: "sass",
  less: "less",
  json: "json",
  yaml: "yaml",
  yml: "yaml",
  xml: "xml",
  md: "markdown",
  sql: "sql",
  sh: "shell",
  bash: "shell",
  zsh: "shell",
  dockerfile: "docker",
  vue: "vue",
  svelte: "svelte",
  astro: "astro",
  sol: "solidity",
  lua: "lua",
  pl: "perl",
  r: "r",
  ex: "elixir",
  exs: "elixir",
  erl: "erlang",
  hs: "haskell",
  ml: "ocaml",
  fs: "fsharp",
  fsx: "fsharp",
  clj: "clojure",
  cljs: "clojure",
  zig: "zig",
  dart: "dart",
  tf: "terraform",
  toml: "toml",
  graphql: "graphql",
  proto: "protobuf",
};

/**
 * Maps well-known file names (without extension) to their language, e.g.
 * `Dockerfile` or `Makefile`.
 */
const LANGUAGE_BY_NAME: Readonly<Record<string, string>> = {
  dockerfile: "docker",
  makefile: "make",
  gemfile: "ruby",
  rakefile: "ruby",
  "cmakelists.txt": "cmake",
};

/**
 * Return the lowercase extension of `fileName` — the segment after the final
 * dot — or `null` when there is none (extensionless or dotfile names).
 *
 * @param fileName - A file name or full path, e.g. `"src/index.ts"`.
 * @returns Lowercase extension without the leading dot, or `null`.
 */
export function extensionOf(fileName: string): string | null {
  const base = fileName.split(/[\\/]/).pop() ?? fileName;
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) {
    return null;
  }
  return base.slice(dot + 1).toLowerCase();
}

/**
 * Detect the programming language for a file based on its name/extension.
 *
 * @param fileName - A file name or full path, e.g. `"src/index.ts"`.
 * @returns The language name (e.g. `"typescript"`), or `null` when unknown.
 */
export function detectLanguageByName(fileName: string): string | null {
  const base = (fileName.split(/[\\/]/).pop() ?? fileName).toLowerCase();
  const byName = LANGUAGE_BY_NAME[base];
  if (byName !== undefined) {
    return byName;
  }
  const extension = extensionOf(fileName);
  if (extension === null) {
    return null;
  }
  return LANGUAGE_BY_EXTENSION[extension] ?? null;
}
