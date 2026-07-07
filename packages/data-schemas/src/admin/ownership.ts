/**
 * Declarative registry of user-owned collections for migration (and a future
 * consolidated delete cascade). Each entry maps a Mongoose model to its owner
 * field and value type.
 */
export type MigrationScopeGroup = 'content' | 'financial' | 'auth';

export type MigrationScope =
  | 'conversation'
  | 'message'
  | 'preset'
  | 'sharedLink'
  | 'conversationTag'
  | 'file'
  | 'agent'
  | 'assistant'
  | 'action'
  | 'promptGroup'
  | 'memory'
  | 'toolCall'
  | 'skill'
  | 'mcpServer'
  | 'agentApiKey'
  | 'agentJob'
  | 'skillSchedule'
  | 'nangoConnection'
  | 'pluginAuth'
  | 'aclEntry'
  | 'transaction'
  | 'balance'
  | 'key'
  | 'systemGrant'
  | 'config'
  | 'token'
  | 'session';

export type OwnerField = 'user' | 'author' | 'userId' | 'principalId';
export type OwnerValueType = 'string' | 'objectId';

export type MigrationSpecialHandler =
  | 'conversationTag'
  | 'prompts'
  | 'mcp'
  | 'acl'
  | 'balance'
  | 'systemGrant'
  | 'config';

export interface OwnedCollectionEntry {
  scopeKey: MigrationScope;
  modelName: string;
  ownerField: OwnerField;
  ownerType: OwnerValueType;
  scopeGroup: MigrationScopeGroup;
  special?: MigrationSpecialHandler;
}

export const OWNERSHIP_REGISTRY: OwnedCollectionEntry[] = [
  {
    scopeKey: 'conversation',
    modelName: 'Conversation',
    ownerField: 'user',
    ownerType: 'string',
    scopeGroup: 'content',
  },
  {
    scopeKey: 'message',
    modelName: 'Message',
    ownerField: 'user',
    ownerType: 'string',
    scopeGroup: 'content',
  },
  {
    scopeKey: 'preset',
    modelName: 'Preset',
    ownerField: 'user',
    ownerType: 'string',
    scopeGroup: 'content',
  },
  {
    scopeKey: 'sharedLink',
    modelName: 'SharedLink',
    ownerField: 'user',
    ownerType: 'string',
    scopeGroup: 'content',
  },
  {
    scopeKey: 'conversationTag',
    modelName: 'ConversationTag',
    ownerField: 'user',
    ownerType: 'string',
    scopeGroup: 'content',
    special: 'conversationTag',
  },
  {
    scopeKey: 'file',
    modelName: 'File',
    ownerField: 'user',
    ownerType: 'objectId',
    scopeGroup: 'content',
  },
  {
    scopeKey: 'agent',
    modelName: 'Agent',
    ownerField: 'author',
    ownerType: 'objectId',
    scopeGroup: 'content',
  },
  {
    scopeKey: 'assistant',
    modelName: 'Assistant',
    ownerField: 'user',
    ownerType: 'objectId',
    scopeGroup: 'content',
  },
  {
    scopeKey: 'action',
    modelName: 'Action',
    ownerField: 'user',
    ownerType: 'objectId',
    scopeGroup: 'content',
  },
  {
    scopeKey: 'promptGroup',
    modelName: 'PromptGroup',
    ownerField: 'author',
    ownerType: 'objectId',
    scopeGroup: 'content',
    special: 'prompts',
  },
  {
    scopeKey: 'memory',
    modelName: 'MemoryEntry',
    ownerField: 'userId',
    ownerType: 'objectId',
    scopeGroup: 'content',
  },
  {
    scopeKey: 'toolCall',
    modelName: 'ToolCall',
    ownerField: 'user',
    ownerType: 'objectId',
    scopeGroup: 'content',
  },
  {
    scopeKey: 'skill',
    modelName: 'Skill',
    ownerField: 'author',
    ownerType: 'objectId',
    scopeGroup: 'content',
  },
  {
    scopeKey: 'mcpServer',
    modelName: 'MCPServer',
    ownerField: 'author',
    ownerType: 'objectId',
    scopeGroup: 'content',
    special: 'mcp',
  },
  {
    scopeKey: 'agentApiKey',
    modelName: 'AgentApiKey',
    ownerField: 'userId',
    ownerType: 'objectId',
    scopeGroup: 'content',
  },
  {
    scopeKey: 'agentJob',
    modelName: 'AgentJob',
    ownerField: 'user',
    ownerType: 'objectId',
    scopeGroup: 'content',
  },
  {
    scopeKey: 'skillSchedule',
    modelName: 'SkillSchedule',
    ownerField: 'user',
    ownerType: 'objectId',
    scopeGroup: 'content',
  },
  {
    scopeKey: 'nangoConnection',
    modelName: 'NangoConnection',
    ownerField: 'userId',
    ownerType: 'objectId',
    scopeGroup: 'content',
  },
  {
    scopeKey: 'pluginAuth',
    modelName: 'PluginAuth',
    ownerField: 'userId',
    ownerType: 'string',
    scopeGroup: 'content',
  },
  {
    scopeKey: 'aclEntry',
    modelName: 'AclEntry',
    ownerField: 'principalId',
    ownerType: 'objectId',
    scopeGroup: 'content',
    special: 'acl',
  },
  {
    scopeKey: 'transaction',
    modelName: 'Transaction',
    ownerField: 'user',
    ownerType: 'objectId',
    scopeGroup: 'financial',
  },
  {
    scopeKey: 'balance',
    modelName: 'Balance',
    ownerField: 'user',
    ownerType: 'objectId',
    scopeGroup: 'financial',
    special: 'balance',
  },
  {
    scopeKey: 'key',
    modelName: 'Key',
    ownerField: 'userId',
    ownerType: 'objectId',
    scopeGroup: 'financial',
  },
  {
    scopeKey: 'systemGrant',
    modelName: 'SystemGrant',
    ownerField: 'principalId',
    ownerType: 'objectId',
    scopeGroup: 'financial',
    special: 'systemGrant',
  },
  {
    scopeKey: 'config',
    modelName: 'Config',
    ownerField: 'principalId',
    ownerType: 'string',
    scopeGroup: 'financial',
    special: 'config',
  },
  {
    scopeKey: 'token',
    modelName: 'Token',
    ownerField: 'userId',
    ownerType: 'objectId',
    scopeGroup: 'auth',
  },
  {
    scopeKey: 'session',
    modelName: 'Session',
    ownerField: 'user',
    ownerType: 'objectId',
    scopeGroup: 'auth',
  },
];

export const ALL_MIGRATION_SCOPES: MigrationScope[] = OWNERSHIP_REGISTRY.map(
  (entry) => entry.scopeKey,
);

/** Scopes included by default in the UI (Session/Token opt-in). */
export const DEFAULT_MIGRATION_SCOPES: MigrationScope[] = OWNERSHIP_REGISTRY.filter(
  (entry) => entry.scopeGroup !== 'auth',
).map((entry) => entry.scopeKey);

export function getRegistryEntriesForScopes(scopes: MigrationScope[]): OwnedCollectionEntry[] {
  const scopeSet = new Set(scopes);
  return OWNERSHIP_REGISTRY.filter((entry) => scopeSet.has(entry.scopeKey));
}

export function getRegistryEntry(scopeKey: MigrationScope): OwnedCollectionEntry | undefined {
  return OWNERSHIP_REGISTRY.find((entry) => entry.scopeKey === scopeKey);
}
