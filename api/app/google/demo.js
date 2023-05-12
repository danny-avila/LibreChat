require('dotenv').config();
const key = require('../../data/auth.json');
const connectDb = require('../../lib/db/connectDb');
const GoogleClient = require('./GoogleClient');

(async () => {
  await connectDb();
  const client = new GoogleClient(key, { debug: true });
  try {
    const result = await client.sendMessage('Hello', {
      onProgress: (progress) => {
        console.log(progress);
      }
    });
    console.log('reply', result);
  } catch (err) {
    console.error(err);
  }
})();
