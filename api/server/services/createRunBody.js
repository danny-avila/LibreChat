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

  if (endpointOption.assistant?.append_today_date) {
    const dateStr = clientTimestamp
      ? clientTimestamp.split('T')[0]
      : new Date().toISOString().split('T')[0];
    const timeStr = clientTimestamp
      ? clientTimestamp.split('T')[1].split('.')[0]
      : new Date().toTimeString().split(' ')[0];
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

module.exports = { createRunBody };
