import { getAgentDefinition, type AgentType } from '../agents/registry.js';

export type { AgentType } from '../agents/registry.js';

export interface AgentLayout {
  commandsDir: string;
  agentDir: string;
  docFile: string;
}

export interface SddConfig {
  agentLayouts?: Partial<Record<AgentType, Partial<AgentLayout>>>;
}

export const resolveAgentLayout = (agent: AgentType, config?: SddConfig): AgentLayout => {
  const base = getAgentDefinition(agent).layout;
  const override = config?.agentLayouts?.[agent] ?? {};
  return { ...base, ...override } as AgentLayout;
};
