const _ = require('lodash');
const sanitizeHtml = require('sanitize-html');
const { titleConvo, citeText, detectCode } = require('../../app/');
const htmlTagRegex = /(<\/?\s*[a-zA-Z]*\s*(?:\s+[a-zA-Z]+\s*=\s*(?:"[^"]*"|'[^']*'))*\s*(?:\/?)>|<\s*[a-zA-Z]+\s*(?:\s+[a-zA-Z]+\s*=\s*(?:"[^"]*"|'[^']*'))*\s*(?:\/?>|<\/?>))/g;

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

    // const htmlTags = tokens.match(htmlTagRegex);
    // if (tokens.includes('```') && htmlTags && htmlTags.length > 0) {
    //   htmlTags.forEach((tag) => {
    //     const sanitizedTag = sanitizeHtml(tag);
    //     tokens = tokens.replaceAll(tag, sanitizedTag);
    //   });
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
  // const htmlTags = text.match(htmlTagRegex);
  // if (text.includes('```') && htmlTags && htmlTags.length > 0) {
  //   htmlTags.forEach((tag) => {
  //     const sanitizedTag = sanitizeHtml(tag);
  //     text = text.replaceAll(tag, sanitizedTag);
  //   });
  // }

  return text;
};

module.exports = { handleError, sendMessage, createOnProgress, handleText };
