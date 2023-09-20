// Escaping curly braces is necessary for LangChain to correctly process the prompt
function escapeBraces(str) {
  return str
    .replace(/({{2,})|(}{2,})/g, (match) => `${match[0]}`)
    .replace(/{|}/g, (match) => `${match}${match}`);
}

function getSnippet(text) {
  let limit = 50;
  let splitText = escapeBraces(text).split(' ');

  if (splitText.length === 1 && splitText[0].length > limit) {
    return splitText[0].substring(0, limit);
  }

  let result = '';
  let spaceCount = 0;

  for (let i = 0; i < splitText.length; i++) {
    if (result.length + splitText[i].length <= limit) {
      result += splitText[i] + ' ';
      spaceCount++;
    } else {
      break;
    }

    if (spaceCount == 10) {
      break;
    }
  }

  return result.trim();
}

module.exports = {
  escapeBraces,
  getSnippet,
};
