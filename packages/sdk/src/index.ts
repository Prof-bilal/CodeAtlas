export { VERSION } from "@atlas/shared";
export type { FilePath, Result } from "@atlas/shared";
export { estimateTokens } from "@atlas/shared";
export type {
  ContextSnapshot,
  PersistedDependency,
  PersistedModule,
  SearchHitKind,
  SearchRequest,
  SearchResult,
  SourceFile,
  Summary,
  SummaryKind,
  SummaryPort,
  Symbol,
} from "@atlas/core";
export type {
  ConfiguratorPort,
  ConfiguratorRequest,
  ConfigurationChange,
  ConfigurationPlan,
  ConfigurationTarget,
  ConfigurationTargetCheck,
  ConfigurationTargetFailure,
  ConfigurationVerification,
  ConfigureOutcome,
} from "@atlas/core";
export {
  Container,
  createProjectContainer,
  type ContainerOptions,
  type ContainerServices,
} from "./container";
export { indexProject } from "./indexing/indexer";
export type { IndexRequest, IndexResult } from "./indexing/indexer";
export { scanProjectOverview } from "./indexing/scan";
export type { FileTreeNode, ProjectScan } from "@atlas/core";
export {
  createContextSDK,
  resolveContextConfig,
  type ContextSDK,
  type ContextSDKOptions,
  type ContextSDKConfig,
  type ContextWriteAPI,
  type DependencyContextAPI,
  type FileContextAPI,
  type ModuleContextAPI,
  type ProjectContextAPI,
  type SearchContextAPI,
  type SummaryContextAPI,
  type SymbolContextAPI,
} from "./context/index";
export type {
  ContextStatus,
  DependencyContext,
  DependencyDirection,
  DependencyQuery,
  DependencyQueryResult,
  FileContentContext,
  FileContext,
  FreshnessSignal,
  FreshnessState,
  ModuleContext,
  ModuleExplanation,
  ProjectCounts,
  ProjectOverview,
  ProjectOverviewDetail,
  ReadRangeRequest,
  ReadRangeResult,
  RelevantContext,
  SymbolContext,
  SymbolReference,
} from "./context/models";
export {
  ContextError,
  ContextNotFoundError,
  ContextUnavailableError,
  DatabaseError,
  DependencyNotFoundError,
  FileNotFoundError,
  InvalidQueryError,
  SymbolNotFoundError,
} from "./context/errors";
export { ReadRepositories, WriteRepositories } from "./context/repositories";
export { createSessionManager, type CreateSessionManagerOptions } from "./sessions/index";
export {
  createAgentService,
  buildInteractiveArgs,
  createAgentMcpService,
  type CreateAgentMcpServiceOptions,
} from "./agents/index";
export type {
  AgentInfo,
  AgentMcpPort,
  AgentMcpStatus,
  AgentMcpStatusEntry,
  AgentMcpTarget,
  AgentPort,
  AgentRunRequest,
  AgentRunResult,
} from "@atlas/core";
export type { AgentServiceOptions } from "@atlas/agents";
export { createUsageService, type CreateUsageServiceOptions } from "./usage/index";
export { createMetricsService, type CreateMetricsServiceOptions } from "./metrics/index";
export { createProviderService, createOllamaService } from "./providers/index";
export type {
  CreateOllamaServiceOptions,
  CreateProviderServiceOptions,
  OllamaConnectRequest,
  OllamaConnectResult,
  OllamaService,
  OllamaStatus,
  ProviderOverview,
} from "./providers/index";
export type { ProviderStatus } from "@atlas/providers";
export { createToolRegistry, type CreateToolRegistryOptions } from "./toolkit/index";
export {
  createCompatibilityEngine,
  type CreateCompatibilityEngineOptions,
} from "./toolkit/index";
export { createInstaller, type CreateInstallerOptions } from "./toolkit/index";
export { createConfigurator, type CreateConfiguratorOptions } from "./toolkit/index";
export {
  createToolkitSDK,
  type CreateToolkitSDKOptions,
  type ToolkitDoctorEntry,
  type ToolkitRemoveOutcome,
  type ToolkitSDK,
  type ToolkitUpdateOutcome,
} from "./toolkit/index";
export { withUsageTracking, trackAgentRun, StaticPricingSource } from "@atlas/usage";
export type { TrackingContext, WithUsageTrackingOptions } from "@atlas/usage";
export {
  UsageError,
  UnknownPriceError,
  UsageLimitExceededError,
} from "@atlas/usage";
export {
  RegistryError,
  RegistryLoadError,
  RegistrySchemaVersionError,
  RegistryValidationError,
} from "@atlas/toolkit";
export {
  CompatibilityError,
  compatibilityStateGlyph,
  EnvironmentDetector,
  renderCompatibilityReport,
} from "@atlas/toolkit";
export {
  InstallApprovalDeniedError,
  InstallBlockedError,
  InstallFailedError,
  InstallInvalidRequestError,
  InstallNotCompatibleError,
  InstallProcessError,
  InstallUnsupportedMethodError,
  InstallerError,
} from "@atlas/toolkit";
export type {
  CompatibilityCheck,
  CompatibilityEvaluationInput,
  CompatibilityPort,
  CompatibilityReport,
  CompatibilityRequirements,
  CompatibilityRuntime,
  CompatibilityState,
} from "@atlas/core";
export type {
  InstallApproval,
  InstallerPort,
  InstallOutcome,
  InstallPlan,
  InstallPlanCommand,
  InstallRollbackStatus,
  InstallVerificationStatus,
  ToolInstallInstruction,
  ToolInstallRequest,
} from "@atlas/core";
export type { EnvironmentDetectorOptions } from "@atlas/toolkit";
export {
  createContextIntegration,
  type AttachInput,
  type BuildPackageInput,
  type ContextIntegration,
  type ContextIntegrationOptions,
  type LaunchInput,
  assembleContextPackage,
  type AssembleInput,
  type AssembleOptions,
  applyBudget,
  DEFAULT_CONTEXT_BUDGET,
  denyFilter,
  type DenyFilterResult,
  collectInstructions,
  type ProjectInstruction,
  detectStaleness,
  createBriefingPort,
  type BriefingPort,
  type BriefingRequest,
  type BriefingResponse,
  BRIEFING_PROMPT_TEMPLATE,
  renderBriefingSection,
  renderContextBriefing,
  renderContextExplanation,
  renderContextPackage,
  toContextExplanation,
  ContextAttachUnsupportedError,
  ContextPackageError,
  type BudgetRecord,
  type ContextBriefing,
  type ContextBudget,
  type ContextExplanation,
  type ContextExplanationItem,
  type ContextItemKind,
  type ContextItemSource,
  type ContextPackage,
  type ContextPackageItem,
  type ExclusionRecord,
  type StaleContextSignal,
  type StalenessState,
} from "./context-integration/index";
export {
  createOrchestrator,
  buildPlan,
  reviewPlan,
  MAX_PLAN_ROLES,
  combineResults,
  detectConflicts,
  renderCombinedReport,
  OrchestratorError,
  PlanValidationError,
  type CreateOrchestratorOptions,
  type Orchestrator,
  type CombinedReport,
  type CombinedSection,
  type RoleConflict,
  type PlanInput,
  type PlanRoleInput,
  type ReviewPlanInput,
  type ReviewProviders,
} from "./orchestrator/index";
export type {
  AgentId,
  Session,
  SessionCreateRequest,
  SessionLaunchRequest,
  SessionOutput,
  SessionPort,
  SessionStatus,
  ContextScope,
  ExecutionMode,
  OrchestrationRun,
  OrchestratorPort,
  RoleDefinition,
  RoleResult,
  RoleStatus,
  RunStatus,
  TaskPlan,
} from "@atlas/core";
export type {
  MetricsActivity,
  MetricsContextEvent,
  MetricsDay,
  MetricsFileEvent,
  MetricsMcpEvent,
  MetricsPerformance,
  MetricsPort,
  MetricsRepository,
  MetricsScanEvent,
  MetricsSearchEvent,
  MetricsSnapshot,
  MetricsTokenEvent,
  MetricsTokens,
} from "@atlas/core";
export type {
  Budget,
  BudgetInput,
  BudgetStatus,
  CostRecord,
  GroupedUsageStatistics,
  LatencyStatistics,
  LimitCheck,
  LimitInput,
  MeasuredQuantity,
  ModelPrice,
  PricingSource,
  QuantitySource,
  TokenUsageRecord,
  UsageEventInput,
  UsageLimit,
  UsagePort,
  UsageProjection,
  UsageQuery,
  UsageRecord,
  UsageScope,
  UsageStatistics,
} from "@atlas/core";
export type {
  FieldProvenance,
  InstallMethod,
  ProvenanceSource,
  ToolDependency,
  ToolField,
  ToolInstallMethodType,
  ToolProvenance,
  ToolRegistryPort,
  ToolRegistryRecord,
  ToolRegistrySource,
  ToolSecurityStatus,
  ToolSecurityStatusValue,
  ToolTier,
  ToolTrustLevel,
} from "@atlas/core";
export type {
  SecurityAssessment,
  SecurityAssessmentInput,
  SecurityCheck,
  SecurityCheckVerdict,
  SecurityDecision,
  SecurityOverride,
  SecurityPort,
  SecurityRiskLevel,
} from "@atlas/core";
export {
  InvalidRepositoryPathError,
  SessionError,
  SessionStateError,
  UnknownSessionError,
} from "@atlas/agents";
export {
  MetricsError,
  MetricsValidationError,
  MetricsSchemaVersionError,
  MetricsPersistenceError,
  METRICS_SCHEMA_VERSION,
  exportJson as exportMetricsJson,
  exportCsv as exportMetricsCsv,
  estimateTokens as estimateMetricTokens,
  calculateSavings,
  createEmptySnapshot,
} from "@atlas/metrics";
