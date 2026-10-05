import { CSHARP_CONFIG } from "./csharp";
import { GO_CONFIG } from "./go";
import { JAVA_CONFIG } from "./java";
import { PYTHON_CONFIG } from "./python";
import { RUST_CONFIG } from "./rust";

/** Every tree-sitter language config shipped by the parser (Wave 1 + Wave 2). */
export const TREE_SITTER_CONFIGS = [
  PYTHON_CONFIG,
  GO_CONFIG,
  JAVA_CONFIG,
  CSHARP_CONFIG,
  RUST_CONFIG,
] as const;
