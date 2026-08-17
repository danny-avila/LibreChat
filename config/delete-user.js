#!/usr/bin/env node
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
const path = require('path');
const mongoose = require('mongoose');
const { createModels, createMethods, runAsSystem } = require('@librechat/data-schemas');
const {
  Key,
  User,
  File,
  Agent,
  Token,
  Group,
  Action,
  Preset,
  Prompt,
  Balance,
  Message,
  Session,
  AclEntry,
  ToolCall,
  Assistant,
  SharedLink,
  PluginAuth,
  MemoryEntry,
  PromptGroup,
  AgentApiKey,
  Transaction,
  Conversation,
  ConversationTag,
} = createModels(mongoose);
require('module-alias')({ base: path.resolve(__dirname, '..', 'api') });
const {
  GenerationJobManager,
  createStreamServices,
  waitForKeyvRedisClient,
} = require('@librechat/api');
const getLogStores = require('~/cache/getLogStores');
const { askQuestion, silentExit } = require('./helpers');
const connect = require('./connect');

const TRIGGER_DRAIN_TIMEOUT_MS = 35_000;
const TRIGGER_DRAIN_POLL_MS = 100;
const methods = createMethods(mongoose, { getCache: getLogStores });

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function gracefulExit(code = 0) {
  try {
    await mongoose.disconnect();
  } catch (err) {
    console.error('Error disconnecting from MongoDB:', err);
  }
  silentExit(code);
}

(async () => {
  await connect();

  console.purple('---------------');
  console.purple('Deleting a user and all related data');
  console.purple('---------------');

  // 1) Get email
  let email = process.argv[2]?.trim();
  if (!email) {
    email = (await askQuestion('Email:')).trim();
  }

  // 2) Find user
  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) {
    console.yellow(`No user found with email "${email}"`);
    return gracefulExit(0);
  }

  // 3) Confirm full deletion
  const confirmAll = await askQuestion(
    `Really delete user ${user.email} (${user._id}) and ALL their data? (y/N)`,
  );
  if (confirmAll.toLowerCase() !== 'y') {
    console.yellow('Aborted.');
    return gracefulExit(0);
  }

  // 4) Ask specifically about transactions
  const confirmTx = await askQuestion('Also delete all transaction history for this user? (y/N)');
  const deleteTx = confirmTx.toLowerCase() === 'y';

  const uid = user._id.toString();

  // The CLI can coordinate live generation aborts only through the shared
  // Redis stream store. Without it, require an explicit offline assertion.
  await waitForKeyvRedisClient();
  const streamServices = createStreamServices();
  const hasSharedGenerationStore = streamServices.isRedis;
  if (!hasSharedGenerationStore) {
    const confirmOffline = await askQuestion(
      'Shared Redis generation coordination is unavailable. Confirm ALL LibreChat app and worker processes are stopped before continuing. (y/N)',
    );
    if (confirmOffline.toLowerCase() !== 'y') {
      console.yellow('Aborted. Stop every LibreChat process or enable Redis stream coordination.');
      return gracefulExit(1);
    }
  } else {
    GenerationJobManager.configure({ ...streamServices, cleanupOnComplete: false });
    GenerationJobManager.initialize();
  }

  let deletionFence;
  let userDeleted = false;

  try {
    deletionFence = new Date();
    const fenceState = await runAsSystem(() =>
      methods.beginAgentTriggerUserDeletion(uid, deletionFence),
    );
    if (fenceState === 'in_progress') {
      deletionFence = undefined;
      throw new Error('Account deletion is already in progress');
    }
    if (fenceState === 'missing') {
      deletionFence = undefined;
    }

    if (deletionFence != null) {
      const settledAt = new Date();
      await runAsSystem(() => methods.fenceAgentTriggerDeliveriesByUser(uid, settledAt));
      if (hasSharedGenerationStore) {
        const deadline = Date.now() + TRIGGER_DRAIN_TIMEOUT_MS;
        while (
          (await runAsSystem(() =>
            methods.countActiveAgentTriggerDeliveriesByUser(uid, new Date()),
          )) > 0
        ) {
          if (Date.now() >= deadline) {
            throw new Error('Timed out draining active agent trigger deliveries');
          }
          await delay(TRIGGER_DRAIN_POLL_MS);
        }
      }
    }

    if (hasSharedGenerationStore) {
      const activeAgentRuns = await GenerationJobManager.getActiveJobIdsForUser(uid, user.tenantId);
      await Promise.all(activeAgentRuns.map((streamId) => GenerationJobManager.abortJob(streamId)));
    }

    await runAsSystem(() => methods.deleteAgentTriggerDeliveriesByUser(uid));

    // 5) Build and run deletion tasks
    const tasks = [
      Action.deleteMany({ user: uid }),
      Agent.deleteMany({ author: uid }),
      AgentApiKey.deleteMany({ user: uid }),
      Assistant.deleteMany({ user: uid }),
      Balance.deleteMany({ user: uid }),
      ConversationTag.deleteMany({ user: uid }),
      Conversation.deleteMany({ user: uid }),
      Message.deleteMany({ user: uid }),
      File.deleteMany({ user: uid }),
      Key.deleteMany({ userId: uid }),
      MemoryEntry.deleteMany({ userId: uid }),
      PluginAuth.deleteMany({ userId: uid }),
      Prompt.deleteMany({ author: uid }),
      PromptGroup.deleteMany({ author: uid }),
      Preset.deleteMany({ user: uid }),
      Session.deleteMany({ user: uid }),
      SharedLink.deleteMany({ user: uid }),
      ToolCall.deleteMany({ user: uid }),
      Token.deleteMany({ userId: uid }),
      AclEntry.deleteMany({ principalId: user._id }),
    ];

    if (deleteTx) {
      tasks.push(Transaction.deleteMany({ user: uid }));
    }

    await Promise.all(tasks);

    // 6) Remove user from all groups
    await Group.updateMany({ memberIds: uid }, { $pullAll: { memberIds: [uid] } });

    // 7) Finally delete the user document itself
    await User.deleteOne({ _id: uid });
    userDeleted = true;
  } finally {
    if (deletionFence != null && !userDeleted) {
      await runAsSystem(() => methods.cancelAgentTriggerUserDeletion(uid, deletionFence)).catch(
        (error) => console.error('Failed to release account-deletion fence:', error),
      );
    }
    if (hasSharedGenerationStore) {
      await GenerationJobManager.destroy().catch((error) =>
        console.error('Failed to close generation coordination:', error),
      );
    }
  }

  console.green(`✔ Successfully deleted user ${email} and all associated data.`);
  if (!deleteTx) {
    console.yellow('⚠️ Transaction history was retained.');
  }

  return gracefulExit(0);
})().catch(async (err) => {
  if (!err.message.includes('fetch failed')) {
    console.error('There was an uncaught error:');
    console.error(err);
    await mongoose.disconnect();
    process.exit(1);
  }
});
