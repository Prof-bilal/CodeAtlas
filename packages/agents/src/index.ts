export type { AgentAdapter, AgentAdapterConfig, AgentName } from "./adapter";
export { createAgentAdapter } from "./adapter";
export { AgentService, type AgentServiceOptions, type ExecutableResolver } from "./agent.service";
export { builtinAdapters } from "./adapters";
export { SessionManager, type SessionManagerOptions } from "./session-manager";
export {
  InvalidRepositoryPathError,
  SessionError,
  SessionStateError,
  UnknownSessionError,
} from "./session-errors";
export {
  AgentCliNotFoundError,
  AgentConfigError,
  AgentRunError,
  InvalidWorkingDirectoryError,
  ProcessSpawnError,
  UnknownAgentError,
} from "./errors";
export { findExecutable } from "./executable";
export {
  ProcessRunner,
  nodeSpawnFn,
  type ProcessResult,
  type ProcessSpec,
  type RunningProcess,
  type SpawnFn,
  type SpawnedProcess,
} from "./process";
