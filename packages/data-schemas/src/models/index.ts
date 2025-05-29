import type { Mongoose } from 'mongoose';
import { default as actionSchema } from '../schema/action';
import { default as agentSchema } from '../schema/agent';
import { default as assistantSchema } from '../schema/assistant';
import { default as balanceSchema } from '../schema/balance';
import { default as bannerSchema } from '../schema/banner';
import { default as categoriesSchema } from '../schema/categories';
import { default as conversationTagSchema } from '../schema/conversationTag';
import { default as convoSchema } from '../schema/convo';
import { default as fileSchema } from '../schema/file';
import { default as keySchema } from '../schema/key';
import { default as messageSchema } from '../schema/message';
import { default as pluginAuthSchema } from '../schema/pluginAuth';
import { default as presetSchema } from '../schema/preset';
import { default as projectSchema } from '../schema/project';
import { default as promptSchema } from '../schema/prompt';
import { default as promptGroupSchema } from '../schema/promptGroup';
import { default as roleSchema } from '../schema/role';
import { default as sessionSchema } from '../schema/session';
import { default as shareSchema } from '../schema/share';
import { default as tokenSchema } from '../schema/token';
import { default as toolCallSchema } from '../schema/toolCall';
import { default as transactionSchema } from '../schema/transaction';
import { default as userSchema } from '../schema/user';
import mongoMeili from './plugins/mongoMeili';

export const registerModels = (mongoose: Mongoose) => {
  const User = registerUserModel(mongoose);
  const Session = registerSessionModel(mongoose);
  const Token = registerTokenModel(mongoose);
  const Message = registerMessageModel(mongoose);
  const Action = registerActionModel(mongoose);
  const Agent = registerAgentModel(mongoose);
  const Assistant = registerAssistantModel(mongoose);
  const Balance = registerBalanceModel(mongoose);
  const Banner = registerBannerModel(mongoose);
  const Categories = registerCategoriesModel(mongoose);
  const ConversationTag = registerConversationTagModel(mongoose);
  const File = registerFileModel(mongoose);
  const Key = registerKeyModel(mongoose);
  const PluginAuth = registerPluginAuthModel(mongoose);
  const Preset = registerPresetModel(mongoose);
  const Project = registerProjectModel(mongoose);
  const Prompt = registerPromptModel(mongoose);
  const PromptGroup = registerPromptGroupModel(mongoose);
  const Role = registerRoleModel(mongoose);
  const SharedLink = registerShareModel(mongoose);
  const ToolCall = registerToolCallModel(mongoose);
  const Transaction = registerTransactionModel(mongoose);
  const Conversation = registerConversationModel(mongoose);

  return {
    User,
    Session,
    Token,
    Message,
    Action,
    Agent,
    Assistant,
    Balance,
    Banner,
    Categories,
    ConversationTag,
    File,
    Key,
    PluginAuth,
    Preset,
    Project,
    Prompt,
    PromptGroup,
    Role,
    SharedLink,
    ToolCall,
    Transaction,
    Conversation,
  };
};

const registerSessionModel = (mongoose: Mongoose) => {
  return mongoose.models.Session || mongoose.model('Session', sessionSchema);
};

const registerUserModel = (mongoose: Mongoose) => {
  return mongoose.models.User || mongoose.model('User', userSchema);
};

const registerTokenModel = (mongoose: Mongoose) => {
  return mongoose.models.Token || mongoose.model('Token', tokenSchema);
};

const registerActionModel = (mongoose: Mongoose) => {
  return mongoose.models.Action || mongoose.model('Action', actionSchema);
};

const registerMessageModel = (mongoose: Mongoose) => {
  if (process.env.MEILI_HOST && process.env.MEILI_MASTER_KEY) {
    messageSchema.plugin(mongoMeili, {
      host: process.env.MEILI_HOST,
      apiKey: process.env.MEILI_MASTER_KEY,
      indexName: 'messages',
      primaryKey: 'messageId',
    });
  }

  return mongoose.models.Message || mongoose.model('Message', messageSchema);
};

const registerAgentModel = (mongoose: Mongoose) => {
  return mongoose.models.Agent || mongoose.model('Agent', agentSchema);
};

const registerAssistantModel = (mongoose: Mongoose) => {
  return mongoose.models.Assistant || mongoose.model('Assistant', assistantSchema);
};

const registerBalanceModel = (mongoose: Mongoose) => {
  return mongoose.models.Balance || mongoose.model('Balance', balanceSchema);
};

const registerBannerModel = (mongoose: Mongoose) => {
  return mongoose.models.Banner || mongoose.model('Banner', bannerSchema);
};

const registerCategoriesModel = (mongoose: Mongoose) => {
  return mongoose.models.Categories || mongoose.model('Categories', categoriesSchema);
};

const registerConversationTagModel = (mongoose: Mongoose) => {
  return (
    mongoose.models.ConversationTag || mongoose.model('ConversationTag', conversationTagSchema)
  );
};
const registerFileModel = (mongoose: Mongoose) => {
  return mongoose.models.File || mongoose.model('File', fileSchema);
};

const registerKeyModel = (mongoose: Mongoose) => {
  return mongoose.models.Key || mongoose.model('Key', keySchema);
};

const registerPluginAuthModel = (mongoose: Mongoose) => {
  return mongoose.models.PluginAuth || mongoose.model('PluginAuth', pluginAuthSchema);
};

const registerPresetModel = (mongoose: Mongoose) => {
  return mongoose.models.Preset || mongoose.model('Preset', presetSchema);
};

const registerProjectModel = (mongoose: Mongoose) => {
  return mongoose.models.Project || mongoose.model('Project', projectSchema);
};
const registerPromptModel = (mongoose: Mongoose) => {
  return mongoose.models.Prompt || mongoose.model('Prompt', promptSchema);
};
const registerPromptGroupModel = (mongoose: Mongoose) => {
  return mongoose.models.PromptGroup || mongoose.model('PromptGroup', promptGroupSchema);
};

const registerRoleModel = (mongoose: Mongoose) => {
  return mongoose.models.Role || mongoose.model('Role', roleSchema);
};
const registerShareModel = (mongoose: Mongoose) => {
  return mongoose.models.SharedLink || mongoose.model('SharedLink', shareSchema);
};

const registerToolCallModel = (mongoose: Mongoose) => {
  return mongoose.models.ToolCall || mongoose.model('ToolCall', toolCallSchema);
};

const registerTransactionModel = (mongoose: Mongoose) => {
  return mongoose.models.Transaction || mongoose.model('Transaction', transactionSchema);
};
const registerConversationModel = (mongoose: Mongoose) => {
  if (process.env.MEILI_HOST && process.env.MEILI_MASTER_KEY) {
    convoSchema.plugin(mongoMeili, {
      host: process.env.MEILI_HOST,
      apiKey: process.env.MEILI_MASTER_KEY,
      /** Note: Will get created automatically if it doesn't exist already */
      indexName: 'convos',
      primaryKey: 'conversationId',
    });
  }

  return mongoose.models.Conversation || mongoose.model('Conversation', convoSchema);
};
