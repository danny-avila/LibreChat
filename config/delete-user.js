const path = require('path');
const mongoose = require(path.resolve(__dirname, '..', 'api', 'node_modules', 'mongoose'));
const {
  User,
  Agent,
  Assistant,
  Balance,
  Transaction,
  ConversationTag,
  Conversation,
  Message,
  File,
  Key,
  MemoryEntry,
  PluginAuth,
  Prompt,
  PromptGroup,
  Preset,
  Session,
  SharedLink,
  ToolCall,
  Token,
} = require('@librechat/data-schemas').createModels(mongoose);
require('module-alias')({ base: path.resolve(__dirname, '..', 'api') });
const { askQuestion, silentExit } = require('./helpers');
const connect = require('./connect');

(async () => {
  await connect();

  /**
   * Show the welcome / help menu
   */
  console.purple('---------------');
  console.purple('Deleting a user and all related data');
  console.purple('---------------');

  // 1) Get email
  let email = process.argv[2];
  if (!email) {
    email = await askQuestion('Email:');
  }

  // 2) Find user
  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) {
    console.yellow(`No user found with email "${email}"`);
    return silentExit(0);
  }

  // 3) Confirm
  const answer = await askQuestion(
    `Really delete user ${user.email} (${user._id}) and ALL their data? (y/N)`,
  );
  if (answer.toLowerCase() !== 'y') {
    console.yellow('Aborted.');
    return silentExit(0);
  }

  // 4) Delete related documents
  const uid = user._id;
  const uidStr = uid.toString();

  await Promise.all([
    Agent.deleteMany({ author: uid }),
    Assistant.deleteMany({ user: uid }),
    Balance.deleteMany({ user: uid }),
    Transaction.deleteMany({ user: uid }),
    ConversationTag.deleteMany({ user: uidStr }),
    Conversation.deleteMany({ user: uidStr }),
    Message.deleteMany({ user: uidStr }),
    File.deleteMany({ user: uid }),
    Key.deleteMany({ userId: uid }),
    MemoryEntry.deleteMany({ userId: uid }),
    PluginAuth.deleteMany({ userId: uidStr }),
    Prompt.deleteMany({ author: uid }),
    PromptGroup.deleteMany({ author: uid }),
    Preset.deleteMany({ user: uidStr }),
    Session.deleteMany({ user: uid }),
    SharedLink.deleteMany({ user: uidStr }),
    ToolCall.deleteMany({ user: uid }),
    Token.deleteMany({ userId: uid }),
  ]);

  // 5) Finally delete the user document itself
  await User.deleteOne({ _id: uid });

  console.green(`✔ Successfully deleted user ${email} and all associated data.`);
  silentExit(0);
})();

process.on('uncaughtException', (err) => {
  if (!err.message.includes('fetch failed')) {
    console.error('There was an uncaught error:');
    console.error(err);
    process.exit(1);
  }
});
