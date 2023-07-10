const { getMessages, saveMessage, deleteMessagesSince, deleteMessages, likeMessage } = require('./Message');
const { getConvoTitle, getConvo, saveConvo, likeConvo } = require('./Conversation');
const { getPreset, getPresets, savePreset, deletePresets } = require('./Preset');

module.exports = {
  getMessages,
  saveMessage,
  deleteMessagesSince,
  deleteMessages,
  likeMessage,

  getConvoTitle,
  getConvo,
  saveConvo,
  likeConvo,

  getPreset,
  getPresets,
  savePreset,
  deletePresets
};
