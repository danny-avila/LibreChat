const mongoose = require('mongoose');
const Conversation = mongoose.models.Conversation;
const Message = mongoose.models.Message;
const { MeiliSearch } = require('meilisearch');
let currentTimeout = null;

// eslint-disable-next-line no-unused-vars
async function indexSync(req, res, next) {
  try {
    if (!process.env.MEILI_HOST || !process.env.MEILI_MASTER_KEY || !process.env.SEARCH) {
      throw new Error('Meilisearch not configured, search will be disabled.');
    }

    const client = new MeiliSearch({
      host: process.env.MEILI_HOST,
      apiKey: process.env.MEILI_MASTER_KEY
    });

    const { status } = await client.health();
    // console.log(`Meilisearch: ${status}`);
    const result = status === 'available' && !!process.env.SEARCH;

    if (!result) {
      throw new Error('Meilisearch not available');
    }

    const messageCount = await Message.countDocuments();
    const convoCount = await Conversation.countDocuments();
    const messages = await client.index('messages').getStats();
    const convos = await client.index('convos').getStats();
    const messagesIndexed = messages.numberOfDocuments;
    const convosIndexed = convos.numberOfDocuments;

    console.log(`There are ${messageCount} messages in the database, ${messagesIndexed} indexed`);
    console.log(`There are ${convoCount} convos in the database, ${convosIndexed} indexed`);

    if (messageCount !== messagesIndexed) {
      console.log('Messages out of sync, indexing');
      await Message.syncWithMeili();
    }

    if (convoCount !== convosIndexed) {
      console.log('Convos out of sync, indexing');
      await Conversation.syncWithMeili();
    }
  } catch (err) {
    // console.log('in index sync');
    if (err.message.includes('not found')) {
      console.log('Creating indices...');
      currentTimeout = setTimeout(async () => {
        try {
          await Message.syncWithMeili();
          await Conversation.syncWithMeili();
        } catch (err) {
          console.error('Trouble creating indices, try restarting the server.');
        }
      }, 750);
    } else {
      console.error(err);
      // res.status(500).json({ error: 'Server error' });
    }
  }
}

process.on('exit', () => {
  console.log('Clearing sync timeouts before exiting...');
  clearTimeout(currentTimeout);
});

module.exports = indexSync;
