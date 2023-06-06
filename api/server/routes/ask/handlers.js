const _ = require('lodash');
const citationRegex = /\[\^\d+?\^]/g;
const backtick = /(?<!`)[`](?!`)/g;
// const singleBacktick = /(?<!`)[`](?!`)/;
const cursorDefault = '<span className="result-streaming">█</span>';
const { getCitations, citeText } = require('../../../app');

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
  let blockCount = 0;
  let codeBlock = false;
  let cursor = cursorDefault;

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
      cursor = cursorDefault;
      precode = precode.replace(/```/g, '');
      code = '';
    }

    if (precode.includes('```') && code === '') {
      precode = precode.replace(/```/g, '');
      codeBlock = true;
      blockCount++;
      cursor = blockCount > 1 ? '█\n\n```' : '█\n\n';
    }

    const backticks = precode.match(backtick);
    if (backticks && !codeBlock && cursor === cursorDefault) {
      precode = precode.replace(backtick, '');
      cursor = '█';
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
    sendMessage(res, { ...payload, text: tokens + cursor });
    _onProgress && _onProgress(payload);
    i++;
  };

  const sendIntermediateMessage = (res, payload) => {
    sendMessage(res, { text: tokens + cursor, message: true, initial: i === 0, ...payload });
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
  // text = await detectCode(text);
  response.text = text;

  if (bing) {
    // const hasCitations = response.response.match(citationRegex)?.length > 0;
    const links = getCitations(response);
    if (response.text.match(citationRegex)?.length > 0) {
      text = citeText(response);
    }
    text += links?.length > 0 ? `\n<small>${links}</small>` : '';
  }

  return text;
};

function formatSteps(steps) {
  let output = '';

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const actionInput = step.action.toolInput;
    const observation = step.observation;

    if (actionInput === 'N/A' || observation?.trim()?.length === 0) {
      continue;
    }

    output += `Input: ${actionInput}\nOutput: ${observation}`;

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
    input: action.toolInput,
    thought: action.log.includes('Thought: ')
      ? action.log.split('\n')[0].replace('Thought: ', '')
      : action.log.split('\n')[0]
  };

  if (action.tool.toLowerCase() === 'self-reflection' || formattedAction.plugin === 'N/A') {
    formattedAction.inputStr = `{\n\tthought: ${formattedAction.input}${
      !formattedAction.thought.includes(formattedAction.input)
        ? ' - ' + formattedAction.thought
        : ''
    }\n}`;
    formattedAction.inputStr = formattedAction.inputStr.replace('N/A - ', '');
  } else {
    formattedAction.inputStr = `{\n\tplugin: ${formattedAction.plugin}\n\tinput: ${formattedAction.input}\n\tthought: ${formattedAction.thought}\n}`;
  }

  return formattedAction;
}

module.exports = {
  handleError,
  sendMessage,
  createOnProgress,
  handleText,
  formatSteps,
  formatAction
};
