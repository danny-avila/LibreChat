/**
 * Obtains the date string in 'YYYY-MM-DD' format.
 *
 * @param {string} [clientTimestamp] - Optional ISO timestamp string. If provided, uses this timestamp;
 * otherwise, uses the current date.
 * @returns {string} - The date string in 'YYYY-MM-DD' format.
 */
function getDateStr(clientTimestamp) {
  return clientTimestamp ? clientTimestamp.split('T')[0] : new Date().toISOString().split('T')[0];
}

/**
 * Obtains the time string in 'HH:MM:SS' format.
 *
 * @param {string} [clientTimestamp] - Optional ISO timestamp string. If provided, uses this timestamp;
 * otherwise, uses the current time.
 * @returns {string} - The time string in 'HH:MM:SS' format.
 */
function getTimeStr(clientTimestamp) {
  return clientTimestamp
    ? clientTimestamp.split('T')[1].split('.')[0]
    : new Date().toTimeString().split(' ')[0];
}

/**
 * Creates the body object for a run request.
 *
 * @param {Object} options - The options for creating the run body.
 * @param {string} options.assistant_id - The assistant ID.
 * @param {string} options.model - The model name.
 * @param {string} [options.promptPrefix] - The prompt prefix to include.
 * @param {string} [options.instructions] - The instructions to include.
 * @param {Object} [options.endpointOption={}] - The endpoint options.
 * @param {string} [options.clientTimestamp] - Client timestamp in ISO format.
 *
 * @returns {Object} - The constructed body object for the run request.
 */
const createRunBody = ({
  assistant_id,
  model,
  promptPrefix,
  instructions,
  endpointOption = {},
  clientTimestamp,
}) => {
  const body = {
    assistant_id,
    model,
  };

  let systemInstructions = '';

  if (endpointOption.assistant?.append_current_datetime) {
    const dateStr = getDateStr(clientTimestamp);
    const timeStr = getTimeStr(clientTimestamp);
    systemInstructions = `Current date and time: ${dateStr} ${timeStr}\n`;
  }

  if (promptPrefix) {
    systemInstructions += promptPrefix;
  }

  if (typeof endpointOption?.artifactsPrompt === 'string' && endpointOption.artifactsPrompt) {
    systemInstructions += `\n${endpointOption.artifactsPrompt}`;
  }

  if (systemInstructions.trim()) {
    body.additional_instructions = systemInstructions.trim();
  }

  if (instructions) {
    body.instructions = instructions;
  }

  return body;
};

module.exports = { createRunBody, getDateStr, getTimeStr };
