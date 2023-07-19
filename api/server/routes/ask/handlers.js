const _ = require('lodash');
const citationRegex = /\[\^\d+?\^]/g;
const { getCitations, citeText } = require('../../../app');
const cursor = '<span className="result-streaming">█</span>';

const handleError = (res, message) => {
  res.write(`event: error\ndata: ${JSON.stringify(message)}\n\n`);
  res.end();
};

const sendMessage = (res, message, event = 'message') => {
  if (message.length === 0) {
    return;
  }
  res.write(`event: ${event}\ndata: ${JSON.stringify(message)}\n\n`);
};

const createOnProgress = ({ onProgress: _onProgress }) => {
  let i = 0;
  let code = '';
  let tokens = '';
  let precode = '';
  let codeBlock = false;

  const progressCallback = async (partial, { res, text, plugin, bing = false, ...rest }) => {
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

    if (tokens.match(/^\n/)) {
      tokens = tokens.replace(/^\n/, '');
    }

    if (bing) {
      tokens = citeText(tokens, true);
    }

    const payload = { text: tokens, message: true, initial: i === 0, ...rest };
    if (plugin) {
      payload.plugin = plugin;
    }
    sendMessage(res, { ...payload, text: tokens });
    _onProgress && _onProgress(payload);
    i++;
  };

  const sendIntermediateMessage = (res, payload) => {
    sendMessage(res, { text: tokens?.length === 0 ? cursor : tokens, message: true, initial: i === 0, ...payload });
    i++;
  };

  const onProgress = (opts) => {
    return _.partialRight(progressCallback, opts);
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
const getString = (input) => isObject(input) ? JSON.stringify(input) : input ;

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
  const capitalizeWords = (input) => {
    if (input === 'dall-e') {
      return 'DALL-E';
    }

    return input
      .replace(/-/g, ' ')
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const formattedAction = {
    plugin: capitalizeWords(action.tool) || action.tool,
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

module.exports = {
  handleError,
  sendMessage,
  createOnProgress,
  handleText,
  formatSteps,
  formatAction,
};