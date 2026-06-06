import { createSkillSyncCredentialModel } from './skillSyncCredential';
import { createSkillSyncStatusModel } from './skillSyncStatus';
import { createConversationTagModel } from './conversationTag';
import { createAgentCategoryModel } from './agentCategory';
import { createChatProjectModel } from './chatProject';
import { createAgentApiKeyModel } from './agentApiKey';
import { createTransactionModel } from './transaction';
import { createPromptGroupModel } from './promptGroup';
import { createSystemGrantModel } from './systemGrant';
import { createPluginAuthModel } from './pluginAuth';
import { createSharedLinkModel } from './sharedLink';
import { createAccessRoleModel } from './accessRole';
import { createMCPServerModel } from './mcpServer';
import { createAssistantModel } from './assistant';
import { createSkillFileModel } from './skillFile';
import { createConversationModel } from './convo';
import { createToolCallModel } from './toolCall';
import { createAclEntryModel } from './aclEntry';
import { createSessionModel } from './session';
import { createBalanceModel } from './balance';
import { createMessageModel } from './message';
import { createActionModel } from './action';
import { createBannerModel } from './banner';
import { createPresetModel } from './preset';
import { createPromptModel } from './prompt';
import { createMemoryModel } from './memory';
import { createConfigModel } from './config';
import { createTokenModel } from './token';
import { createAgentModel } from './agent';
import { createSkillModel } from './skill';
import { createGroupModel } from './group';
import { createUserModel } from './user';
import { createRoleModel } from './role';
import { createFileModel } from './file';
import { createKeyModel } from './key';

/**
 * Creates all database models for all collections
 */
export function createModels(mongoose: typeof import('mongoose')) {
  return {
    User: createUserModel(mongoose),
    Token: createTokenModel(mongoose),
    Session: createSessionModel(mongoose),
    Balance: createBalanceModel(mongoose),
    Conversation: createConversationModel(mongoose),
    ChatProject: createChatProjectModel(mongoose),
    Message: createMessageModel(mongoose),
    Agent: createAgentModel(mongoose),
    AgentApiKey: createAgentApiKeyModel(mongoose),
    AgentCategory: createAgentCategoryModel(mongoose),
    MCPServer: createMCPServerModel(mongoose),
    Role: createRoleModel(mongoose),
    Action: createActionModel(mongoose),
    Assistant: createAssistantModel(mongoose),
    File: createFileModel(mongoose),
    Banner: createBannerModel(mongoose),
    Key: createKeyModel(mongoose),
    PluginAuth: createPluginAuthModel(mongoose),
    Transaction: createTransactionModel(mongoose),
    Preset: createPresetModel(mongoose),
    Prompt: createPromptModel(mongoose),
    PromptGroup: createPromptGroupModel(mongoose),
    Skill: createSkillModel(mongoose),
    SkillFile: createSkillFileModel(mongoose),
    SkillSyncCredential: createSkillSyncCredentialModel(mongoose),
    SkillSyncStatus: createSkillSyncStatusModel(mongoose),
    ConversationTag: createConversationTagModel(mongoose),
    SharedLink: createSharedLinkModel(mongoose),
    ToolCall: createToolCallModel(mongoose),
    MemoryEntry: createMemoryModel(mongoose),
    AccessRole: createAccessRoleModel(mongoose),
    AclEntry: createAclEntryModel(mongoose),
    SystemGrant: createSystemGrantModel(mongoose),
    Group: createGroupModel(mongoose),
    Config: createConfigModel(mongoose),
  };
}
