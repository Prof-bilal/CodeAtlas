import { atlasConfig } from "../../tsup.config.base";

export default atlasConfig({
  entry: ["src/extension.ts"],
  // `vscode` is provided by the VS Code extension host at runtime; never bundle it.
  external: ["vscode", "commander"],
  format: ["esm"],
  dts: false,
});
