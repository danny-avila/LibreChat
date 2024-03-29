const path = require('path');
require('module-alias')({ base: path.resolve(__dirname, '..', 'api') });
const { silentExit } = require('./helpers');
const Conversation = require('~/models/schema/convoSchema');
const Message = require('~/models/schema/messageSchema');
const User = require('~/models/User');
const connect = require('./connect');

(async () => {
  await connect();

  /**
   * Show the welcome / help menu
   */
  console.purple('-----------------------------');
  console.purple('Show the stats of all users');
  console.purple('-----------------------------');

  let users = await User.find({});
  let userData = [];
  for (const user of users) {
    let conversationsCount = (await Conversation.count({ user: user._id })) ?? 0;
    let messagesCount = (await Message.count({ user: user._id })) ?? 0;

    userData.push({
      User: user.name,
      Conversations: conversationsCount,
      Messages: messagesCount,
    });
  }

  userData.sort((a, b) => {
    if (a.Conversations !== b.Conversations) {
      return b.Conversations - a.Conversations;
    }

    return b.Messages - a.Messages;
  });

  console.table(userData);

  silentExit(0);
})();

process.on('uncaughtException', (err) => {
  if (!err.message.includes('fetch failed')) {
    console.error('There was an uncaught error:');
    console.error(err);
  }

  if (!err.message.includes('fetch failed')) {
    process.exit(1);
  }
});
