import { atlasConfig } from "../../tsup.config.base";

export default atlasConfig({
  entry: { index: "src/index.ts", bin: "src/bin.ts" },
  format: ["esm"],
  dts: true,
  external: ["@modelcontextprotocol/sdk", "ts-morph"],
});
