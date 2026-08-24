import { atlasConfig } from "../../tsup.config.base";

// The server runs standalone (`node dist/index.js`); ESM output is sufficient.
// `ts-morph` stays external like the CLI — it is a runtime dependency.
export default atlasConfig({
  format: ["esm"],
  dts: false,
  external: ["ts-morph"],
});
