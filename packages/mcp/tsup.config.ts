import { atlasConfig } from "../../tsup.config.base";

// Library (dist/index.{js,cjs,d.ts}) + runnable stdio server binary
// (dist/bin.js). The MCP protocol SDK stays external so consumers and the bin
// resolve it from their own node_modules. `ts-morph` (pulled in transitively
// through the indexer's parser) stays external too: its CJS dynamic
// `require("fs")` cannot survive bundling into the ESM output, mirroring the
// CLI build's `external: ["commander", "ts-morph"]`.
export default atlasConfig({
  entry: {
    index: "src/index.ts",
    bin: "src/bin.ts",
  },
  format: ["esm", "cjs"],
  external: ["@modelcontextprotocol/sdk", "ts-morph"],
});
