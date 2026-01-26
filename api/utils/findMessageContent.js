const { logger } = require('@librechat/data-schemas');

function findContent(obj) {
  if (obj && typeof obj === 'object') {
    if ('kwargs' in obj && 'content' in obj.kwargs) {
      return obj.kwargs.content;
    }
    for (let key in obj) {
      let content = findContent(obj[key]);
      if (content) {
        return content;
      }
    }
  }
  return null;
}

function findMessageContent(message) {
  let startIndex = Math.min(message.indexOf('{'), message.indexOf('['));
  let jsonString = message.substring(startIndex);

  let jsonObjectOrArray;
  try {
    jsonObjectOrArray = JSON.parse(jsonString);
  } catch (error) {
    logger.error('[findMessageContent] Failed to parse JSON:', error);
    return null;
  }

  let content = findContent(jsonObjectOrArray);

  return content;
}

module.exports = findMessageContent;
