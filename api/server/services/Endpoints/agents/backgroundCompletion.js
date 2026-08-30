const {
  createBackgroundToolCompletionWakeupHandler,
  createBackgroundToolResultHandler,
} = require('@librechat/api');
const { enqueueAgentTrigger, retireAgentTrigger } = require('../../Agents/triggers');

const preregisterBackgroundToolCompletion = createBackgroundToolCompletionWakeupHandler(
  enqueueAgentTrigger,
  retireAgentTrigger,
);

function createBackgroundToolResultPersistence({ req, updateToolCallResult }) {
  return createBackgroundToolResultHandler({ req, updateToolCallResult });
}

module.exports = {
  preregisterBackgroundToolCompletion,
  createBackgroundToolResultPersistence,
};
