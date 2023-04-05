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

const sendMessage = (res, message) => {
  if (message.length === 0) {
    return;
  }
  res.write(`event: message\ndata: ${JSON.stringify(message)}\n\n`);
};

const createOnProgress = () => {
  let i = 0;
  let code = '';
  let tokens = '';
  let precode = '';
  let blockCount = 0;
  let codeBlock = false;
  let cursor = cursorDefault;

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

    sendMessage(res, { text: tokens + cursor, message: true, initial: i === 0, ...rest });
    i++;
  };

  const onProgress = opts => {
    return _.partialRight(progressCallback, opts);
  };

  return onProgress;
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

module.exports = { handleError, sendMessage, createOnProgress, handleText };
