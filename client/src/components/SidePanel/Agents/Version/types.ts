export type VersionRecord = Record<string, any>;

export type AgentState = {
  name: string | null;
  description: string | null;
  instructions: string | null;
  artifacts?: string | null;
  capabilities?: string[];
  tools?: string[];
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
  tools?: string[];
  versions?: Array<VersionRecord>;
}
