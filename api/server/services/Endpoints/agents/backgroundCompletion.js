const {
  createBackgroundToolCompletionWakeupHandler,
  createBackgroundToolResultHandler,
} = require('@librechat/api');
const {
  enqueueAgentTrigger,
  renewAgentTriggerProducerLease,
  retireAgentTrigger,
} = require('../../Agents/triggers');

const preregisterBackgroundToolCompletion = createBackgroundToolCompletionWakeupHandler(
  enqueueAgentTrigger,
  retireAgentTrigger,
  renewAgentTriggerProducerLease,
);

function createBackgroundToolResultPersistence({ req, updateToolCallResult }) {
  return createBackgroundToolResultHandler({ req, updateToolCallResult });
}

module.exports = {
  preregisterBackgroundToolCompletion,
  createBackgroundToolResultPersistence,
};
