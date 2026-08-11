import { atlasConfig } from "../../tsup.config.base";

// Library (dist/index.{js,cjs,d.ts}) + runnable stdio server binary
// (dist/bin.js). The MCP protocol SDK stays external so consumers and the bin
// resolve it from their own node_modules.
export default atlasConfig({
  entry: {
    index: "src/index.ts",
    bin: "src/bin.ts",
  },
  format: ["esm", "cjs"],
  external: ["@modelcontextprotocol/sdk"],
});
