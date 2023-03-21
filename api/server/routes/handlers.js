const _ = require('lodash');
const citationRegex = /\[\^\d+?\^]/g;
const { getCitations, citeText, detectCode } = require('../../app/');

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

    if (bing) {
      tokens = citeText(tokens, true);
    }

    sendMessage(res, { text: tokens + '<span class="result-streaming">█</span>', message: true, initial: i === 0, ...rest });
    i++;
  };

  const onProgress = (model, opts) => {
    const bingModels = new Set(['bingai', 'sydney']);
    return _.partialRight(progressCallback, { ...opts, bing: bingModels.has(model) });
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
