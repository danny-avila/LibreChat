const mongoose = require('mongoose');
const { Conversation, } = require('../../models/Conversation');
const { getMessages, } = require('../../models/');

async function migrateDb() {
  try {
    const conversations = await Conversation.find({ model: null }).exec();

    if (!conversations || conversations.length === 0)
      return { message: '[Migrate] No conversations to migrate' };

    for (let convo of conversations) {
      const messages = await getMessages({
        conversationId: convo.conversationId,
        messageId: { $exists: false }
      });

      let model;
      let oldId;
      const promises = [];
      messages.forEach((message, i) => {
        const msgObj = message.toObject();
        const newId = msgObj.id;
        if (i === 0) {
          message.parentMessageId = '00000000-0000-0000-0000-000000000000';
        } else {
          message.parentMessageId = oldId;
        }

        oldId = newId;
        message.messageId = newId;
        if (message.sender.toLowerCase() !== 'user' && !model) {
          model = message.sender.toLowerCase();
        }

        if (message.sender.toLowerCase() === 'user') {
          message.isCreatedByUser = true;
        }
        
        promises.push(message.save());
      });
      await Promise.all(promises);

      await Conversation.findOneAndUpdate(
        { conversationId: convo.conversationId },
        { model },
        { new: true }
      ).exec();
    }

    try {
      await mongoose.connection.db.collection('messages').dropIndex('id_1');
    } catch (error) {
      console.log("[Migrate] Index doesn't exist or already dropped");
    }
  } catch (error) {
    console.log(error);
    return { message: '[Migrate] Error migrating conversations' };
  }
}


module.exports = migrateDb;