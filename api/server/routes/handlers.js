const { citeText, detectCode } = require('../../app/');
const _ = require('lodash');
const sanitizeHtml = require('sanitize-html');

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
  let tokens = '';

  const progressCallback = async (partial, { res, text, bing = false, ...rest }) => {
    tokens += partial === text ? '' : partial;
    tokens = tokens.replaceAll('[DONE]', '');

    if (tokens.match(/^\n/)) {
      tokens = tokens.replace(/^\n/, '');
    }
    // if (tokens.includes('```')) {
    //   tokens = sanitizeHtml(tokens);
    // }

    if (bing) {
      tokens = citeText(tokens, true);
    }

    sendMessage(res, { text: tokens, message: true, initial: i === 0, ...rest });
    i++;
  };

  const onProgress = (model, opts) => {
    const bingModels = new Set(['bingai', 'sydney']);
    return _.partialRight(progressCallback, { ...opts, bing: bingModels.has(model) });
  };

  return onProgress;
};

const handleText = async (input) => {
  let text = input;
  text = await detectCode(text);
  // if (text.includes('```')) {
  //   text = sanitizeHtml(text);
  //   text = text.replaceAll(') =&gt;', ') =>');
  // }

  return text;
};

module.exports = { handleError, sendMessage, createOnProgress, handleText };