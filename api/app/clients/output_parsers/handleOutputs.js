const { instructions, imageInstructions, errorInstructions } = require('../prompts');

function getActions(actions = [], functionsAgent = false) {
  let output = 'Internal thoughts & actions taken:\n"';

  if (actions[0]?.action && functionsAgent) {
    actions = actions.map((step) => ({
      log: `Action: ${step.action?.tool || ''}\nInput: ${
        JSON.stringify(step.action?.toolInput) || ''
      }\nObservation: ${step.observation}`,
    }));
  } else if (actions[0]?.action) {
    actions = actions.map((step) => ({
      log: `${step.action.log}\nObservation: ${step.observation}`,
    }));
  }

  actions.forEach((actionObj, index) => {
    output += `${actionObj.log}`;
    if (index < actions.length - 1) {
      output += '\n';
    }
  });

  return output + '"';
}

function buildErrorInput({ message, errorMessage, actions, functionsAgent }) {
  const log = errorMessage.includes('Could not parse LLM output:')
    ? `A formatting error occurred with your response to the human's last message. You didn't follow the formatting instructions. Remember to ${instructions}`
    : `You encountered an error while replying to the human's last message. Attempt to answer again or admit an answer cannot be given.\nError: ${errorMessage}`;

  return `
    ${log}

    ${getActions(actions, functionsAgent)}

    Human's last message: ${message}
    `;
}

function buildPromptPrefix({ result, message, functionsAgent }) {
  if ((result.output && result.output.includes('N/A')) || result.output === undefined) {
    return null;
  }

  if (
    result?.intermediateSteps?.length === 1 &&
    result?.intermediateSteps[0]?.action?.toolInput === 'N/A'
  ) {
    return null;
  }

  const internalActions =
    result?.intermediateSteps?.length > 0
      ? getActions(result.intermediateSteps, functionsAgent)
      : 'Internal Actions Taken: None';

  const toolBasedInstructions = internalActions.toLowerCase().includes('image')
    ? imageInstructions
    : '';

  const errorMessage = result.errorMessage ? `${errorInstructions} ${result.errorMessage}\n` : '';

  const preliminaryAnswer =
    result.output?.length > 0 ? `Preliminary Answer: "${result.output.trim()}"` : '';
  const prefix = preliminaryAnswer
    ? 'review and improve the answer you generated using plugins in response to the User Message below. The user hasn\'t seen your answer or thoughts yet.'
    : 'respond to the User Message below based on your preliminary thoughts & actions.';

  return `As a helpful AI Assistant, ${prefix}${errorMessage}\n${internalActions}
${preliminaryAnswer}
Reply conversationally to the User based on your ${
  preliminaryAnswer ? 'preliminary answer, ' : ''
}internal actions, thoughts, and observations, making improvements wherever possible, but do not modify URLs.
${
  preliminaryAnswer
    ? ''
    : '\nIf there is an incomplete thought or action, you are expected to complete it in your response now.\n'
}You must cite sources if you are using any web links. ${toolBasedInstructions}
Only respond with your conversational reply to the following User Message:
"${message}"`;
}

module.exports = {
  buildErrorInput,
  buildPromptPrefix,
};
