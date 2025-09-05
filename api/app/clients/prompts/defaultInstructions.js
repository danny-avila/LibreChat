const DEFAULT_SYSTEM_INSTRUCTION = `After providing your response to the user's query, always include 3 related follow-up questions at the end. These questions should be relevant to the topic discussed and help guide the user to explore the subject further. Format the questions with phrases like "Should I...", "Would you like me to...", "Do you want to...", or similar inquiry patterns. Present these questions in a clear, bulleted list after your main response.`;

/**
 * Combines user's custom promptPrefix with the default system instruction
 * @param {string} userPromptPrefix - User's custom prompt prefix (can be empty)
 * @returns {string} Combined system instruction
 */
function buildSystemInstruction(userPromptPrefix = '') {
  const trimmedUserPrefix = (userPromptPrefix || '').trim();
  
  if (trimmedUserPrefix) {
    return `${trimmedUserPrefix}\n\n${DEFAULT_SYSTEM_INSTRUCTION}`;
  }
  
  return DEFAULT_SYSTEM_INSTRUCTION;
}

module.exports = {
  DEFAULT_SYSTEM_INSTRUCTION,
  buildSystemInstruction,
};