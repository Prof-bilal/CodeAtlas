export {
  createIgnoreMatcher,
  DEFAULT_IGNORED_DIRECTORIES,
} from "./ignore";
export {
  GITIGNORE_FILE_NAME,
  GitignoreMatcher,
  type GitignoreRule,
  type GitignoreScope,
  parseGitignore,
} from "./gitignore";
export {
  detectFramework,
  type FrameworkSignals,
} from "./framework";
export {
  detectLanguageByName,
  extensionOf,
  LANGUAGE_BY_EXTENSION,
} from "./language";
export {
  ScannerService,
  scanProject,
  type ScannerOptions,
} from "./scanner.service";
export {
  collectGitInfo,
  detectPackageManager,
  generateManifest,
  loadManifest,
  MANIFEST_DIR_NAME,
  MANIFEST_FILE_NAME,
  MANIFEST_VERSION,
  type GeneratedManifest,
  type GitInfo,
  type ManifestOptions,
  type PackageManager,
  type ProjectManifest,
} from "./manifest";
