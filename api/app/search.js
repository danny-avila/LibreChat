const mongoose = require('mongoose');
const mongomeili = require('mongomeili');
const { messageSchema, Message } = require('../models/Message');

// Add the '{ meiliIndex: true }' property to index these attributes with MeiliSearch
// const MovieSchema = new mongoose.Schema({
//   title: { type: String, required: true, meiliIndex: true },
//   director: { type: String, required: true, meiliIndex: true },
//   year: { type: String, required: true, meiliIndex: true }
// });

// Specify your MeiliSearch credentials
// messageSchema.plugin(mongomeili, {
//   host: 'http://localhost:7700',
//   apiKey: 'MASTER_KEY',
//   indexName: 'messages' // Will get created automatically if it doesn't exist already
// });

(async () => {
  await Message.syncWithMeili();
  const result = await Message.meiliSearch({ query: 'quantum' });
  
  console.log(result);
})();
