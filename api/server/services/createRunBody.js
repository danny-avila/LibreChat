const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

/**
 * Converts a bounded, strict ISO timestamp to a canonical UTC value. Invalid
 * client text is never interpolated into model instructions.
 *
 * @param {unknown} clientTimestamp
 * @returns {string | undefined}
 */
function normalizeClientTimestamp(clientTimestamp) {
  if (
    typeof clientTimestamp !== 'string' ||
    clientTimestamp.length > 64 ||
    !ISO_TIMESTAMP.test(clientTimestamp)
  ) {
    return undefined;
  }
  const parsed = new Date(clientTimestamp);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }
  return parsed.toISOString();
}

function getTimestampOrNow(clientTimestamp) {
  return normalizeClientTimestamp(clientTimestamp) ?? new Date().toISOString();
}

/**
 * Obtains the date string in 'YYYY-MM-DD' format.
 *
 * @param {string} [clientTimestamp] - Optional ISO timestamp string.
 * @returns {string} - The date string in 'YYYY-MM-DD' format.
 */
function getDateStr(clientTimestamp) {
  return getTimestampOrNow(clientTimestamp).slice(0, 10);
}

/**
 * Obtains the time string in 'HH:MM:SS' format.
 *
 * @param {string} [clientTimestamp] - Optional ISO timestamp string.
 * @returns {string} - The time string in 'HH:MM:SS' format.
 */
function getTimeStr(clientTimestamp) {
  return getTimestampOrNow(clientTimestamp).slice(11, 19);
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

module.exports = { createRunBody, getDateStr, getTimeStr, normalizeClientTimestamp };
