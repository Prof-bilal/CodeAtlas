import { atlasConfig } from "../../tsup.config.base";

// The CLI is a standalone binary, so ESM output is sufficient (and required —
// its entry uses top-level `await`).
export default atlasConfig({
  format: ["esm"],
  dts: false,
});
