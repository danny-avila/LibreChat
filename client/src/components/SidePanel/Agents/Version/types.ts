import type { AgentInstructionPrompt, GraphEdge } from 'librechat-data-provider';

export type VersionRecord = Record<string, any>;

export type AgentState = {
  name: string | null;
  description: string | null;
  instructions: string | null;
  artifacts?: string | null;
  instruction_prompt?: AgentInstructionPrompt | null;
  capabilities?: string[];
  tools?: string[];
  edges?: GraphEdge[];
} | null;

export type VersionWithId = {
  id: number;
  originalIndex: number;
  version: VersionRecord;
  isActive: boolean;
};

export type VersionContext = {
  versions: VersionRecord[];
  versionIds: VersionWithId[];
  currentAgent: AgentState;
  selectedAgentId: string;
  activeVersion: VersionRecord | null;
};

export interface AgentWithVersions {
  name: string;
  description: string | null;
  instructions: string | null;
  artifacts?: string | null;
  capabilities?: string[];
  instruction_prompt?: AgentInstructionPrompt | null;
  tools?: string[];
  edges?: GraphEdge[];
  versions?: Array<VersionRecord>;
}
