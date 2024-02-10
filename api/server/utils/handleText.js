const partialRight = require('lodash/partialRight');
const { sendMessage } = require('./streamResponse');
const { getCitations, citeText } = require('./citations');
const citationRegex = /\[\^\d+?\^]/g;

const addSpaceIfNeeded = (text) => (text.length > 0 && !text.endsWith(' ') ? text + ' ' : text);

const createOnProgress = ({ generation = '', onProgress: _onProgress }) => {
  let i = 0;
  let code = '';
  let precode = '';
  let codeBlock = false;
  let tokens = addSpaceIfNeeded(generation);

  const progressCallback = async (partial, { res, text, bing = false, ...rest }) => {
    let chunk = partial === text ? '' : partial;
    tokens += chunk;
    precode += chunk;
    tokens = tokens.replaceAll('[DONE]', '');

    if (codeBlock) {
      code += chunk;
    }

    if (precode.includes('```') && codeBlock) {
      codeBlock = false;
      precode = precode.replace(/```/g, '');
      code = '';
    }

    if (precode.includes('```') && code === '') {
      precode = precode.replace(/```/g, '');
      codeBlock = true;
    }

    if (tokens.match(/^\n(?!:::plugins:::)/)) {
      tokens = tokens.replace(/^\n/, '');
    }

    if (bing) {
      tokens = citeText(tokens, true);
    }

    const payload = { text: tokens, message: true, initial: i === 0, ...rest };
    sendMessage(res, { ...payload, text: tokens });
    _onProgress && _onProgress(payload);
    i++;
  };

  const sendIntermediateMessage = (res, payload, extraTokens = '') => {
    tokens += extraTokens;
    sendMessage(res, {
      text: tokens?.length === 0 ? '' : tokens,
      message: true,
      initial: i === 0,
      ...payload,
    });
    i++;
  };

  const onProgress = (opts) => {
    return partialRight(progressCallback, opts);
  };

  const getPartialText = () => {
    return tokens;
  };

  return { onProgress, getPartialText, sendIntermediateMessage };
};

const handleText = async (response, bing = false) => {
  let { text } = response;
  response.text = text;

  if (bing) {
    const links = getCitations(response);
    if (response.text.match(citationRegex)?.length > 0) {
      text = citeText(response);
    }
    text += links?.length > 0 ? `\n- ${links}` : '';
  }

  return text;
};

const isObject = (item) => item && typeof item === 'object' && !Array.isArray(item);
const getString = (input) => (isObject(input) ? JSON.stringify(input) : input);

function formatSteps(steps) {
  let output = '';

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const actionInput = getString(step.action.toolInput);
    const observation = step.observation;

    if (actionInput === 'N/A' || observation?.trim()?.length === 0) {
      continue;
    }

    output += `Input: ${actionInput}\nOutput: ${getString(observation)}`;

    if (steps.length > 1 && i !== steps.length - 1) {
      output += '\n---\n';
    }
  }

  return output;
}

function formatAction(action) {
  const formattedAction = {
    plugin: action.tool,
    input: getString(action.toolInput),
    thought: action.log.includes('Thought: ')
      ? action.log.split('\n')[0].replace('Thought: ', '')
      : action.log.split('\n')[0],
  };

  formattedAction.thought = getString(formattedAction.thought);

  if (action.tool.toLowerCase() === 'self-reflection' || formattedAction.plugin === 'N/A') {
    formattedAction.inputStr = `{\n\tthought: ${formattedAction.input}${
      !formattedAction.thought.includes(formattedAction.input)
        ? ' - ' + formattedAction.thought
        : ''
    }\n}`;
    formattedAction.inputStr = formattedAction.inputStr.replace('N/A - ', '');
  } else {
    const hasThought = formattedAction.thought.length > 0;
    const thought = hasThought ? `\n\tthought: ${formattedAction.thought}` : '';
    formattedAction.inputStr = `{\n\tplugin: ${formattedAction.plugin}\n\tinput: ${formattedAction.input}\n${thought}}`;
  }

  return formattedAction;
}

/**
 * Checks if the given value is truthy by being either the boolean `true` or a string
 * that case-insensitively matches 'true'.
 *
 * @function
 * @param {string|boolean|null|undefined} value - The value to check.
 * @returns {boolean} Returns `true` if the value is the boolean `true` or a case-insensitive
 *                    match for the string 'true', otherwise returns `false`.
 * @example
 *
 * isEnabled("True");  // returns true
 * isEnabled("TRUE");  // returns true
 * isEnabled(true);    // returns true
 * isEnabled("false"); // returns false
 * isEnabled(false);   // returns false
 * isEnabled(null);    // returns false
 * isEnabled();        // returns false
 */
function isEnabled(value) {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    return value.toLowerCase().trim() === 'true';
  }
  return false;
}

/**
 * Checks if the provided value is 'user_provided'.
 *
 * @param {string} value - The value to check.
 * @returns {boolean} - Returns true if the value is 'user_provided', otherwise false.
 */
const isUserProvided = (value) => value === 'user_provided';

/**
 * Extracts the value of an environment variable from a string.
 * @param {string} value - The value to be processed, possibly containing an env variable placeholder.
 * @returns {string} - The actual value from the environment variable or the original value.
 */
function extractEnvVariable(value) {
  const envVarMatch = value.match(/^\${(.+)}$/);
  if (envVarMatch) {
    return process.env[envVarMatch[1]] || value;
  }
  return value;
}

module.exports = {
  createOnProgress,
  isEnabled,
  handleText,
  formatSteps,
  formatAction,
  addSpaceIfNeeded,
  isUserProvided,
  extractEnvVariable,
};
