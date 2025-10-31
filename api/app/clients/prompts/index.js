const formatMessages = require('./formatMessages');
const summaryPrompts = require('./summaryPrompts');
const handleInputs = require('./handleInputs');
const instructions = require('./instructions');
const titlePrompts = require('./titlePrompts');
const truncate = require('./truncate');
const createVisionPrompt = require('./createVisionPrompt');
const createContextHandlers = require('./createContextHandlers');

module.exports = {
  ...formatMessages,
  ...summaryPrompts,
  ...handleInputs,
  ...instructions,
  ...titlePrompts,
  ...truncate,
  createVisionPrompt,
  createContextHandlers,
};
