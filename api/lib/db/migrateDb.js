const mongoose = require('mongoose');
const { Conversation } = require('../../models/Conversation');
const { getMessages } = require('../../models/');

const migrateToStrictFollowParentMessageIdChain = async () => {
  try {
    const conversations = await Conversation.find({ endpoint: null, model: null }).exec();

    if (!conversations || conversations.length === 0) return { noNeed: true };

    console.log('Migration: To strict follow the parentMessageId chain.');

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
};

const migrateToSupportBetterCustomization = async () => {
  try {
    const conversations = await Conversation.find({ endpoint: null }).exec();

    if (!conversations || conversations.length === 0) return { noNeed: true };

    console.log('Migration: To support better customization.');

    const promises = [];
    for (let convo of conversations) {
      const originalModel = convo?.model;

      if (originalModel === 'chatgpt') {
        convo.endpoint = 'openAI';
        convo.model = 'gpt-3.5-turbo';
      } else if (originalModel === 'chatgptCustom') {
        convo.endpoint = 'openAI';
        convo.model = 'gpt-3.5-turbo';
      } else if (originalModel === 'bingai') {
        convo.endpoint = 'bingAI';
        convo.model = null;
        convo.jailbreak = false;
      } else if (originalModel === 'sydney') {
        convo.endpoint = 'bingAI';
        convo.model = null;
        convo.jailbreak = true;
      } else if (originalModel === 'chatgptBrowser') {
        convo.endpoint = 'chatGPTBrowser';
        convo.model = 'text-davinci-002-render-sha';
        convo.jailbreak = true;
      } else {
        convo.endpoint = 'openAI';
        convo.model = 'gpt-3.5-turbo';
      }

      promises.push(convo.save());
    }

    await Promise.all(promises);
  } catch (error) {
    console.log(error);
    return { message: '[Migrate] Error migrating conversations' };
  }
};

async function migrateDb() {
  let ret = [];
  ret[0] = await migrateToStrictFollowParentMessageIdChain();
  ret[1] = await migrateToSupportBetterCustomization();

  const isMigrated = !!ret.find((element) => !element?.noNeed);

  if (!isMigrated) console.log('[Migrate] Nothing to migrate');
}

module.exports = migrateDb;