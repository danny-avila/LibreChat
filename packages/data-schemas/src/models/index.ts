import type { Mongoose } from 'mongoose';
import {
  agentSchema,
  assistantSchema,
  balanceSchema,
  categoriesSchema,
  messageSchema,
  sessionSchema,
  tokenSchema,
  userSchema,
  conversationTagSchema,
  convoSchema,
  fileSchema,
  keySchema,
  presetSchema,
  projectSchema,
  promptSchema,
  roleSchema,
  shareSchema,
  toolCallSchema,
  transactionSchema,
  bannerSchema,
  promptGroupSchema,
} from '..';
import mongoMeili from './plugins/mongoMeili';

export const registerModels = (mongoose: Mongoose) => {
  const User = registerUserModel(mongoose);
  const Session = registerSessionModel(mongoose);
  const Token = registerTokenModel(mongoose);
  const Message = registerMessageModel(mongoose);
  const Agent = registerAgentModel(mongoose);
  const Assistant = registerAssistantModel(mongoose);
  const Balance = registerBalanceModel(mongoose);
  const Banner = registerBannerModel(mongoose);
  const Categories = registerCategoriesModel(mongoose);
  const ConversationTag = registerConversationTagModel(mongoose);
  const File = registerFileModel(mongoose);
  const Key = registerKeyModel(mongoose);
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
    Agent,
    Assistant,
    Balance,
    Banner,
    Categories,
    ConversationTag,
    File,
    Key,
    Preset,
    Project,
    Prompt,
    PromptGroup
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
  return mongoose.models.Transaction || mongoose.model('Trasaction', transactionSchema);
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
