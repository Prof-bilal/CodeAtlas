import { AgentService } from "@atlas/agents";
import type { AgentPort, ConfiguratorPort } from "@atlas/core";
import { ConfiguratorService, type ConfiguratorServiceOptions } from "@atlas/toolkit";

export interface CreateConfiguratorOptions extends Omit<ConfiguratorServiceOptions, "agentPort"> {
  readonly agents?: AgentPort;
}

/** Compose the Tool Configurator behind the SDK port. */
export function createConfigurator(options: CreateConfiguratorOptions = {}): ConfiguratorPort {
  const agents = options.agents ?? new AgentService();
  return new ConfiguratorService({ ...options, agentPort: agents });
}
