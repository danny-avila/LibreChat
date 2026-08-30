const {
  createBackgroundToolCompletionWakeupHandler,
  createBackgroundToolResultHandler,
} = require('@librechat/api');
const { enqueueAgentTrigger } = require('../../Agents/triggers');

const preregisterBackgroundToolCompletion =
  createBackgroundToolCompletionWakeupHandler(enqueueAgentTrigger);

function createBackgroundToolResultPersistence({ req, updateToolCallResult }) {
  return createBackgroundToolResultHandler({ req, updateToolCallResult });
}

module.exports = {
  preregisterBackgroundToolCompletion,
  createBackgroundToolResultPersistence,
};
