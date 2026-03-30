const path = require('path');
const mongoose = require('mongoose');
require('module-alias')({ base: path.resolve(__dirname, '..', 'api') });
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const { askQuestion, silentExit } = require('./helpers');
const connect = require('./connect');
const { batchResetMeiliFlags } = require('~/db/utils');

(async () => {
  await connect();

  console.purple('---------------------------------------');
  console.purple('Reset MeiliSearch Synchronization Flags');
  console.purple('---------------------------------------');
  console.yellow('\nThis script will reset the MeiliSearch indexing flags in MongoDB.');
  console.yellow('Use this when MeiliSearch data has been deleted or corrupted,');
  console.yellow('and you need to trigger a full re-synchronization.\n');

  const confirm = await askQuestion(
    'Are you sure you want to reset all MeiliSearch sync flags? (y/N): ',
  );

  if (confirm.toLowerCase() !== 'y') {
    console.orange('Operation cancelled.');
    silentExit(0);
  }

  try {
    const clearProgress = () => process.stdout.write('\r' + ' '.repeat(70) + '\r');

    // Reset _meiliIndex flags for messages
    console.cyan('\nResetting message sync flags...');
    const messages = mongoose.connection.db.collection('messages');
    const messageModifiedCount = await batchResetMeiliFlags(messages);
    clearProgress();
    console.green(`✓ Reset ${messageModifiedCount} message sync flags`);

    // Reset _meiliIndex flags for conversations
    console.cyan('\nResetting conversation sync flags...');
    const conversationsCollection = mongoose.connection.db.collection('conversations');
    const conversationModifiedCount = await batchResetMeiliFlags(conversationsCollection);
    clearProgress();
    console.green(`✓ Reset ${conversationModifiedCount} conversation sync flags`);

    // Query to count only non-expired documents that are queued for sync (_meiliIndex: false)
    // This represents documents that need to be indexed, not the total collection size
    const queryTotal = { expiredAt: null, _meiliIndex: false };

    // Get current counts of documents queued for sync
    const totalMessages = await mongoose.connection.db
      .collection('messages')
      .countDocuments(queryTotal);
    const totalConversations = await mongoose.connection.db
      .collection('conversations')
      .countDocuments(queryTotal);

    console.purple('\n---------------------------------------');
    console.green('MeiliSearch sync flags have been reset successfully!');
    console.cyan(`\nDocuments queued for sync:`);
    console.cyan(`Messages: ${totalMessages}`);
    console.cyan(`Conversations: ${totalConversations}`);
    console.yellow('\nThe next time LibreChat starts or performs a sync check,');
    console.yellow('all data will be re-indexed into MeiliSearch.');
    console.purple('---------------------------------------\n');

    // Ask if user wants to see advanced options
    const showAdvanced = await askQuestion('Show advanced options? (y/N): ');

    if (showAdvanced.toLowerCase() === 'y') {
      console.cyan('\nAdvanced Options:');
      console.yellow('1. To trigger immediate sync, restart LibreChat');
      console.yellow('2. To disable sync, set MEILI_NO_SYNC=true in .env');
      console.yellow(
        '3. To adjust sync batch size, set MEILI_SYNC_BATCH_SIZE in .env (default: 100)',
      );
      console.yellow('4. To adjust sync delay, set MEILI_SYNC_DELAY_MS in .env (default: 100ms)');
      console.yellow(
        '5. To change sync threshold, set MEILI_SYNC_THRESHOLD in .env (default: 1000)\n',
      );
    }

    silentExit(0);
  } catch (error) {
    console.red('\nError resetting MeiliSearch sync flags:');
    console.error(error);
    silentExit(1);
  }
})();

process.on('uncaughtException', (err) => {
  if (!err.message.includes('fetch failed')) {
    console.error('There was an uncaught error:');
    console.error(err);
  }

  if (err.message.includes('fetch failed')) {
    return;
  } else {
    process.exit(1);
  }
});
