export {
  CompatibilityError,
  ManifestError,
  ManifestLoadError,
  ManifestSchemaVersionError,
  ManifestValidationError,
  RegistryError,
  RegistryLoadError,
  RegistrySchemaVersionError,
  RegistryValidationError,
} from "./errors";
export { RegistryStore } from "./registry-store";
export type { RegistryStoreOptions } from "./registry-store";
export { loadRegistry, ToolRegistryService } from "./registry.service";
export type { LoadRegistryOptions, ToolRegistryServiceOptions } from "./registry.service";
export {
  DEFAULT_CATEGORIES,
  DEFAULT_SECURITY,
  DEFAULT_TRUST,
  INSTALL_METHOD_TYPES,
  REGISTRY_SCHEMA_VERSION,
  SECURITY_STATUSES,
  TRUST_LEVELS,
  validateCatalog,
  validateOverlay,
  validateToolRecord,
} from "./schema";
export type { ToolRegistryCatalog } from "./schema";
export {
  createToolManifest,
  isValidToolName,
  listInstalledTools,
  loadToolManifest,
  MANIFEST_DIR_NAME,
  MAX_TOOL_MANIFEST_BYTES,
  saveToolManifest,
  TOOL_MANIFESTS_DIR_NAME,
  TOOL_MANIFEST_FILE_EXTENSION,
  toolManifestPath,
} from "./manifest";
export type {
  CreateToolManifestInput,
  CreateToolManifestOptions,
  SaveToolManifestOptions,
  SavedToolManifest,
  ToolManifestInstallationInput,
} from "./manifest";
export {
  DEFAULT_MANIFEST_COMPATIBILITY,
  DEFAULT_MANIFEST_CONFIGURATION,
  DEFAULT_MANIFEST_INTEGRATION_STATE,
  DEFAULT_MANIFEST_SECURITY,
  DEFAULT_MANIFEST_VERIFICATION,
  parseToolManifest,
  serializeToolManifest,
  TOOL_MANIFEST_CONFIGURATION_TYPES,
  TOOL_MANIFEST_SOURCE_KINDS,
  TOOL_MANIFEST_SCHEMA_VERSION,
  TOOL_INTEGRATION_STATE_STATUSES,
  TOOL_VERIFICATION_STATUSES,
  validateToolManifest,
} from "./manifest-schema";
export type {
  ToolIntegrationStateStatus,
  ToolManifest,
  ToolManifestCompatibility,
  ToolManifestConfiguration,
  ToolManifestConfigurationType,
  ToolManifestInstallation,
  ToolManifestIntegrationState,
  ToolManifestProvenance,
  ToolManifestRuntime,
  ToolManifestSecurity,
  ToolManifestSourceKind,
  ToolVerificationStatus,
} from "./manifest-schema";
export {
  CompatibilityEngineService,
  type CompatibilityEngineOptions,
} from "./compatibility.service";
export {
  InstallerService,
  type InstallerServiceOptions,
} from "./installer.service";
export { SecurityAssessor } from "./security.service";
export { ConfiguratorService, type ConfiguratorServiceOptions } from "./configurator.service";
export {
  ClaudeAdapter,
  GeminiAdapter,
  CodexAdapter,
  OpenCodeAdapter,
  McpAdapter,
  VsCodeAdapter,
  builtinConfigurationAdapters,
} from "./configurator-adapters";
export {
  FsConfigWriter,
  applyConfigurationChange,
  buildConfigurationChange,
  rollbackConfiguration,
  type ConfigWriter,
  type ConfigurationAdapter,
  type ConfigurationContext,
} from "./configurator-adapter";
export {
  ConfiguratorError,
  ConfiguratorRequestError,
  ConfigReadError,
  ConfigMergeError,
  ConfigWriteError,
  ConfigVerifyError,
} from "./configurator-errors";
export type {
  AdapterPlan,
  EcosystemAdapter,
} from "./installer-adapter";
export {
  CargoAdapter,
  GoAdapter,
  NpmAdapter,
  PipAdapter,
} from "./installer-adapters";
export { InstallerProcess, nodeSpawnFn } from "./installer-process";
export type {
  InstallerProcessOptions,
  InstallerProcessResult,
  InstallerProcessSpec,
  InstallerSpawnFn,
  SpawnedProcess,
} from "./installer-process";
export {
  InstallApprovalDeniedError,
  InstallBlockedError,
  InstallFailedError,
  InstallInvalidRequestError,
  InstallNotCompatibleError,
  InstallProcessError,
  InstallUnsupportedMethodError,
  InstallerError,
} from "./installer-errors";
export {
  defaultReadVersion,
  EnvironmentDetector,
  findExecutable,
  type EnvironmentDetectorOptions,
  type PackageManagerInfo,
  type RuntimeInfo,
} from "./environment";
export { compatibilityStateGlyph, renderCompatibilityReport } from "./render";
export {
  extractVersion,
  satisfiesVersionRange,
  type VersionTuple,
} from "./version-range";
