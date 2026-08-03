#!/usr/bin/env node
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
const path = require('path');
const mongoose = require('mongoose');
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
  Schedule,
  ScheduleRun,
} = require('@librechat/data-schemas').createModels(mongoose);
require('module-alias')({ base: path.resolve(__dirname, '..', 'api') });
const { markUserDeleting, disableUserSchedulesForDeletion } = require('~/models');
const { askQuestion, silentExit } = require('./helpers');
const connect = require('./connect');

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

  // Raise the durable deletion barrier BEFORE counting. A bare count is a
  // time-of-check/time-of-use read: a fire can be claimed and accepted between the zero
  // result and the deletes below, and this script cannot abort or drain it. The barrier
  // is what makes the count meaningful — a live server refuses new fires at the dispatch
  // boundary (fireSchedule's isOwnerDeleting probe) from this point on, so anything the
  // count then misses cannot have started after it.
  //
  // Through markUserDeleting, never a raw update: that method also drops the auth
  // user-doc cache entry, and fails closed — a cache it cannot reach aborts the
  // deletion rather than proceeding behind a barrier that was never actually raised.
  try {
    await markUserDeleting(uid);
  } catch (err) {
    console.red('✖ Could not raise the deletion barrier. Nothing was deleted.');
    console.error(err);
    return gracefulExit(1);
  }

  // FENCE IN-FLIGHT FIRES before counting. The barrier alone does not close this: a
  // fire consults the owner-deleting probe once, at the START of its preflight (user,
  // permission, balance and attachment lookups), so one that passed that probe moments
  // before the barrier went up is still mid-preflight — invisible to the count below,
  // and free to reserve and dispatch afterwards because every later fence revalidates
  // the SCHEDULE, not the user. Disabling the schedules rotates each claim token, which
  // is exactly what those later fences check: a fire not yet reserved steps aside, and
  // one already reserved rolls back at its pre-POST revalidation. Only then does the
  // count actually close over every fire, as the comment above claims.
  await disableUserSchedulesForDeletion(uid);

  // SCOPE, stated plainly: this barrier stops SCHEDULING — the engine's claims, the
  // fire dispatch boundary, and every schedule write consult it. It is NOT a general
  // request barrier: the auth strategies do not read `deletionRequestedAt`, so a live
  // server keeps admitting this user's existing access tokens for the rest of the
  // cascade, and an in-flight request can still write. Nothing here can drain those,
  // and no sleep bounds them (an access token outlives any cache TTL by minutes), so
  // this script does not pretend to — refusing the ACTIVE-RUN case below is what it can
  // honestly guarantee. Closing the general case needs a barrier at authentication;
  // tracked in packages/api/src/schedules/FOLLOWUPS.md.

  // REFUSE rather than warn when a scheduled run is in flight. This script talks to the
  // database directly, so unlike the HTTP deletion paths it cannot abort a live loopback
  // generation or wait for it to drain. That generation can already have passed its
  // owner lookup, and it will persist its messages after the rows deleted here are gone
  // — resurrecting data for an account the operator believes is erased.
  const activeRuns = await ScheduleRun.countDocuments({
    user: uid,
    status: { $in: ['started', 'requires_action'] },
  });
  if (activeRuns > 0) {
    console.red(
      `✖ ${activeRuns} scheduled run(s) are still active for this user, and this script cannot abort them.`,
    );
    // Deliberately NOT "stop the server and retry": stopping it cannot transition a
    // persisted row, so every offline retry would see the same active status forever.
    // Only a running server settles these — by draining them (app deletion) or by
    // reconciling an abandoned run whose lease expired.
    console.yellow(
      'The deletion barrier is up, so this user can no longer sign in. Start the server (if',
    );
    console.yellow(
      'stopped) and let reconciliation settle the abandoned run, then re-run this script.',
    );
    return gracefulExit(1);
  }

  // Runs BEFORE schedules so a partial failure stays retryable, mirroring
  // deleteSchedulesByUser. A schedule carries the user's prompt text and has no TTL,
  // so leaving it behind retains that content indefinitely.
  await ScheduleRun.deleteMany({ user: uid });
  await Schedule.deleteMany({ user: uid });

  // 5) Run the deletion tasks. Constructed HERE rather than earlier: a Model.deleteMany()
  // call dispatches the moment it is written, so building this list above the guards
  // would start erasing the account before the barrier could be raised or an in-flight
  // scheduled run could refuse the whole operation.
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
