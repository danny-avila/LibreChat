const Conversation = require('../models/schema/convoSchema');
const Preset = require('../models/schema/presetSchema');

const migrateConversations = async (userId) => {
  try {
    return await Conversation.updateMany({ user: null }, { $set: { user: userId } }).exec();
  } catch (error) {
    console.log(error);
    return { message: 'Error saving conversation' };
  }
};

const migratePresets = async (userId) => {
  try {
    return await Preset.updateMany({ user: null }, { $set: { user: userId } }).exec();
  } catch (error) {
    console.log(error);
    return { message: 'Error saving conversation' };
  }
};

const migrateDataToFirstUser = async (user) => {
  const conversations = await migrateConversations(user.id);
  console.log(conversations);
  const presets = await migratePresets(user.id);
  console.log(presets);
};

module.exports = migrateDataToFirstUser;
