import { createRequire } from "node:module";
import { Language, Parser } from "web-tree-sitter";

/**
 * Lazy loader for `web-tree-sitter` and the WASM grammars shipped by
 * `tree-sitter-wasms`.
 *
 * The WASM engine is pure WebAssembly (no `node-gyp`), so it installs on any
 * platform. Both the engine init and each grammar load are cached; a missing or
 * incompatible grammar resolves to `undefined` so the affected language is
 * skipped (the parser's existing contract) instead of crashing the build.
 */
const require = createRequire(import.meta.url);

let engineReady: Promise<void> | undefined;
const grammarCache = new Map<string, Promise<Language | undefined>>();

function initEngine(): Promise<void> {
  engineReady ??= Parser.init();
  return engineReady;
}

/** Load (and cache) a grammar by its `tree-sitter-wasms` basename. */
export function loadGrammar(grammar: string): Promise<Language | undefined> {
  let cached = grammarCache.get(grammar);
  if (cached === undefined) {
    cached = (async () => {
      try {
        await initEngine();
        const wasmPath = require.resolve(`tree-sitter-wasms/out/tree-sitter-${grammar}.wasm`);
        return await Language.load(wasmPath);
      } catch {
        return undefined;
      }
    })();
    grammarCache.set(grammar, cached);
  }
  return cached;
}

/**
 * A fresh {@link Parser} with `grammar` set, or `undefined` when the grammar is
 * unavailable. A new parser per file keeps parsing stateless and avoids
 * retaining parse state across a large corpus.
 */
export async function createGrammarParser(grammar: string): Promise<Parser | undefined> {
  const language = await loadGrammar(grammar);
  if (language === undefined) {
    return undefined;
  }
  const parser = new Parser();
  parser.setLanguage(language);
  return parser;
}

/** Whether a grammar can be loaded here (used by `atlas doctor`). */
export async function isGrammarAvailable(grammar: string): Promise<boolean> {
  return (await loadGrammar(grammar)) !== undefined;
}
