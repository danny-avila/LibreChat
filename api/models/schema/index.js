const mongoose = require('mongoose');
const convoSchema = require('./convoSchema');
const messageSchema = require('./messageSchema');
const { MeiliSearch } = require('meilisearch');
const mongoMeili = require('../../lib/db/mongoMeili');

(async () => {
  try {
    const client = new MeiliSearch({
      host: process.env.MEILI_HOST,
      apiKey: process.env.MEILI_KEY
    });

    const { status } = await client.health();
    console.log(`Meilisearch: ${status}`);
    const result = status === 'available' && !!process.env.SEARCH;

    if (!result) {
      throw new Error('Meilisearch not available');
    }

    convoSchema.plugin(mongoMeili, {
      host: process.env.MEILI_HOST,
      apiKey: process.env.MEILI_KEY,
      indexName: 'convos', // Will get created automatically if it doesn't exist already
      primaryKey: 'conversationId'
    });

    messageSchema.plugin(mongoMeili, {
      host: process.env.MEILI_HOST,
      apiKey: process.env.MEILI_KEY,
      indexName: 'messages',
      primaryKey: 'messageId'
    });

  } catch (error) {
    console.log('Meilisearch error, search will be disabled');
    console.error(error);
  }
})();

const Conversation =
mongoose.models.Conversation || mongoose.model('Conversation', convoSchema);
const Message = mongoose.models.Message || mongoose.model('Message', messageSchema);

module.exports = { Conversation, Message };
