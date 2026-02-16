import { createSessionMethods, DEFAULT_REFRESH_TOKEN_EXPIRY, type SessionMethods } from './session';
import { createTokenMethods, type TokenMethods } from './token';
import { createRoleMethods, type RoleMethods, type RoleDeps } from './role';
import { createUserMethods, DEFAULT_SESSION_EXPIRY, type UserMethods } from './user';

export { DEFAULT_REFRESH_TOKEN_EXPIRY, DEFAULT_SESSION_EXPIRY };
import { createKeyMethods, type KeyMethods } from './key';
import { createFileMethods, type FileMethods } from './file';
/* Memories */
import { createMemoryMethods, type MemoryMethods } from './memory';
/* Agent Categories */
import { createAgentCategoryMethods, type AgentCategoryMethods } from './agentCategory';
/* Agent API Keys */
import { createAgentApiKeyMethods, type AgentApiKeyMethods } from './agentApiKey';
/* MCP Servers */
import { createMCPServerMethods, type MCPServerMethods } from './mcpServer';
/* Plugin Auth */
import { createPluginAuthMethods, type PluginAuthMethods } from './pluginAuth';
/* Permissions */
import { createAccessRoleMethods, type AccessRoleMethods } from './accessRole';
import { createUserGroupMethods, type UserGroupMethods } from './userGroup';
import { createAclEntryMethods, type AclEntryMethods } from './aclEntry';
import { createShareMethods, type ShareMethods } from './share';
/* Tier 1 — Simple CRUD */
import { createActionMethods, type ActionMethods } from './action';
import { createAssistantMethods, type AssistantMethods } from './assistant';
import { createBannerMethods, type BannerMethods } from './banner';
import { createToolCallMethods, type ToolCallMethods } from './toolCall';
import { createCategoriesMethods, type CategoriesMethods } from './categories';
import { createPresetMethods, type PresetMethods } from './preset';
/* Tier 2 — Moderate (service deps injected) */
import { createConversationTagMethods, type ConversationTagMethods } from './conversationTag';
import { createMessageMethods, type MessageMethods } from './message';
import { createConversationMethods, type ConversationMethods } from './conversation';
/* Tier 3 — Complex (heavier injection) */
import {
  createTxMethods,
  type TxMethods,
  type TxDeps,
  tokenValues,
  cacheTokenValues,
  premiumTokenValues,
  defaultRate,
} from './tx';
import { createTransactionMethods, type TransactionMethods } from './transaction';
import { createSpendTokensMethods, type SpendTokensMethods } from './spendTokens';
import { createPromptMethods, type PromptMethods, type PromptDeps } from './prompt';

export { tokenValues, cacheTokenValues, premiumTokenValues, defaultRate };

export type AllMethods = UserMethods &
  SessionMethods &
  TokenMethods &
  RoleMethods &
  KeyMethods &
  FileMethods &
  MemoryMethods &
  AgentCategoryMethods &
  AgentApiKeyMethods &
  MCPServerMethods &
  UserGroupMethods &
  AclEntryMethods &
  ShareMethods &
  AccessRoleMethods &
  PluginAuthMethods &
  ActionMethods &
  AssistantMethods &
  BannerMethods &
  ToolCallMethods &
  CategoriesMethods &
  PresetMethods &
  ConversationTagMethods &
  MessageMethods &
  ConversationMethods &
  TxMethods &
  TransactionMethods &
  SpendTokensMethods &
  PromptMethods;

/** Dependencies injected from the api layer into createMethods */
export interface CreateMethodsDeps {
  /** Creates an expiration date for temporary chats. From @librechat/api. */
  createTempChatExpirationDate?: (interfaceConfig?: unknown) => Date;
  /** Escapes special regex characters. From @librechat/api. */
  escapeRegExp?: (s: string) => string;
  /** Matches a model name to a canonical key. From @librechat/api. */
  matchModelName?: (model: string, endpoint?: string) => string | undefined;
  /** Finds the first key in values whose key is a substring of model. From @librechat/api. */
  findMatchingPattern?: (model: string, values: Record<string, unknown>) => string | undefined;
  /** Removes all ACL permissions for a resource. From PermissionService. */
  removeAllPermissions?: (params: { resourceType: string; resourceId: string }) => Promise<void>;
  /** Returns a cache store for the given key. From getLogStores. */
  getCache?: RoleDeps['getCache'];
}

/**
 * Creates all database methods for all collections
 * @param mongoose - Mongoose instance
 * @param deps - Optional dependencies injected from the api layer
 */
export function createMethods(
  mongoose: typeof import('mongoose'),
  deps: CreateMethodsDeps = {},
): AllMethods {
  // Tier 3: tx methods need matchModelName and findMatchingPattern
  const txDeps: TxDeps = {
    matchModelName: deps.matchModelName ?? (() => undefined),
    findMatchingPattern: deps.findMatchingPattern ?? (() => undefined),
  };
  const txMethods = createTxMethods(mongoose, txDeps);

  // Tier 3: transaction methods need tx's getMultiplier/getCacheMultiplier
  const transactionMethods = createTransactionMethods(mongoose, {
    getMultiplier: txMethods.getMultiplier,
    getCacheMultiplier: txMethods.getCacheMultiplier,
  });

  // Tier 3: spendTokens methods need transaction methods
  const spendTokensMethods = createSpendTokensMethods(mongoose, {
    createTransaction: transactionMethods.createTransaction,
    createStructuredTransaction: transactionMethods.createStructuredTransaction,
  });

  // Tier 2: message methods need createTempChatExpirationDate
  const messageMethods = createMessageMethods(mongoose, {
    createTempChatExpirationDate: deps.createTempChatExpirationDate,
  });

  // Tier 2: conversation methods need createTempChatExpirationDate + message methods
  const conversationMethods = createConversationMethods(
    mongoose,
    { createTempChatExpirationDate: deps.createTempChatExpirationDate },
    { getMessages: messageMethods.getMessages, deleteMessages: messageMethods.deleteMessages },
  );

  // Tier 3: prompt methods need escapeRegExp + removeAllPermissions
  const promptDeps: PromptDeps = {
    escapeRegExp: deps.escapeRegExp ?? ((s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    removeAllPermissions: deps.removeAllPermissions ?? (async () => {}),
  };
  const promptMethods = createPromptMethods(mongoose, promptDeps);

  // Role methods with optional cache injection
  const roleDeps: RoleDeps = { getCache: deps.getCache };
  const roleMethods = createRoleMethods(mongoose, roleDeps);

  return {
    ...createUserMethods(mongoose),
    ...createSessionMethods(mongoose),
    ...createTokenMethods(mongoose),
    ...roleMethods,
    ...createKeyMethods(mongoose),
    ...createFileMethods(mongoose),
    ...createMemoryMethods(mongoose),
    ...createAgentCategoryMethods(mongoose),
    ...createAgentApiKeyMethods(mongoose),
    ...createMCPServerMethods(mongoose),
    ...createAccessRoleMethods(mongoose),
    ...createUserGroupMethods(mongoose),
    ...createAclEntryMethods(mongoose),
    ...createShareMethods(mongoose),
    ...createPluginAuthMethods(mongoose),
    /* Tier 1 */
    ...createActionMethods(mongoose),
    ...createAssistantMethods(mongoose),
    ...createBannerMethods(mongoose),
    ...createToolCallMethods(mongoose),
    ...createCategoriesMethods(mongoose),
    ...createPresetMethods(mongoose),
    /* Tier 2 */
    ...createConversationTagMethods(mongoose),
    ...messageMethods,
    ...conversationMethods,
    /* Tier 3 */
    ...txMethods,
    ...transactionMethods,
    ...spendTokensMethods,
    ...promptMethods,
  };
}

export type {
  UserMethods,
  SessionMethods,
  TokenMethods,
  RoleMethods,
  KeyMethods,
  FileMethods,
  MemoryMethods,
  AgentCategoryMethods,
  AgentApiKeyMethods,
  MCPServerMethods,
  UserGroupMethods,
  AclEntryMethods,
  ShareMethods,
  AccessRoleMethods,
  PluginAuthMethods,
  ActionMethods,
  AssistantMethods,
  BannerMethods,
  ToolCallMethods,
  CategoriesMethods,
  PresetMethods,
  ConversationTagMethods,
  MessageMethods,
  ConversationMethods,
  TxMethods,
  TransactionMethods,
  SpendTokensMethods,
  PromptMethods,
};
