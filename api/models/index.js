const mongoose = require('mongoose');
const { createMethods } = require('@librechat/data-schemas');
const methods = createMethods(mongoose);
const { comparePassword } = require('./userMethods');
const {
  findFileById,
  createFile,
  updateFile,
  deleteFile,
  deleteFiles,
  getFiles,
  updateFileUsage,
} = require('./File');
const {
  getGroups,
  getGroup,
  createGroup,
  updateGroup,
  deleteGroup,
  addTimeWindow,
  updateTimeWindow,
  removeTimeWindow,
  getUserGroups,
  getGroupStats,
  getAvailableUsers,
  getGroupMembers,
  addUserToGroup,
  removeUserFromGroup,
} = require('./Group');
const {
  getMessage,
  getMessages,
  saveMessage,
  recordMessage,
  updateMessage,
  deleteMessagesSince,
  deleteMessages,
} = require('./Message');
const { getConvoTitle, getConvo, saveConvo, deleteConvos } = require('./Conversation');
const { getPreset, getPresets, savePreset, deletePresets } = require('./Preset');

module.exports = {
  ...methods,
  comparePassword,
  findFileById,
  createFile,
  updateFile,
  deleteFile,
  deleteFiles,
  getFiles,
  updateFileUsage,

  getGroups,
  getGroup,
  createGroup,
  updateGroup,
  deleteGroup,
  addTimeWindow,
  updateTimeWindow,
  removeTimeWindow,
  getUserGroups,
  getGroupStats,
  getAvailableUsers,
  getGroupMembers,
  addUserToGroup,
  removeUserFromGroup,

  getMessage,
  getMessages,
  saveMessage,
  recordMessage,
  updateMessage,
  deleteMessagesSince,
  deleteMessages,

  getConvoTitle,
  getConvo,
  saveConvo,
  deleteConvos,

  getPreset,
  getPresets,
  savePreset,
  deletePresets,
};
