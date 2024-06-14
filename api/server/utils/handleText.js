const {
  Capabilities,
  EModelEndpoint,
  isAssistantsEndpoint,
  defaultRetrievalModels,
  defaultAssistantsVersion,
} = require('librechat-data-provider');
const { getCitations, citeText } = require('./citations');
const partialRight = require('lodash/partialRight');
const { sendMessage } = require('./streamResponse');
const citationRegex = /\[\^\d+?\^]/g;

const addSpaceIfNeeded = (text) => (text.length > 0 && !text.endsWith(' ') ? text + ' ' : text);

const createOnProgress = ({ generation = '', onProgress: _onProgress }) => {
  let i = 0;
  let tokens = addSpaceIfNeeded(generation);

  const progressCallback = async (partial, { res, text, bing = false, ...rest }) => {
    let chunk = partial === text ? '' : partial;
    tokens += chunk;
    tokens = tokens.replaceAll('[DONE]', '');

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
 * Generate the configuration for a given key and base URL.
 * @param {string} key
 * @param {string} baseURL
 * @param {string} endpoint
 * @returns {boolean | { userProvide: boolean, userProvideURL?: boolean }}
 */
function generateConfig(key, baseURL, endpoint) {
  if (!key) {
    return false;
  }

  /** @type {{ userProvide: boolean, userProvideURL?: boolean }} */
  const config = { userProvide: isUserProvided(key) };

  if (baseURL) {
    config.userProvideURL = isUserProvided(baseURL);
  }

  const assistants = isAssistantsEndpoint(endpoint);

  if (assistants) {
    config.retrievalModels = defaultRetrievalModels;
    config.capabilities = [
      Capabilities.code_interpreter,
      Capabilities.image_vision,
      Capabilities.retrieval,
      Capabilities.actions,
      Capabilities.tools,
    ];
  }

  if (assistants && endpoint === EModelEndpoint.azureAssistants) {
    config.version = defaultAssistantsVersion.azureAssistants;
  } else if (assistants) {
    config.version = defaultAssistantsVersion.assistants;
  }

  return config;
}

module.exports = {
  createOnProgress,
  isEnabled,
  handleText,
  formatSteps,
  formatAction,
  addSpaceIfNeeded,
  isUserProvided,
  generateConfig,
};
