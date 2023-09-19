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

const formatMessage = ({ message, userName, assistantName }) => {
  let { role: _role, _name, sender, text } = message;
  const role = _role ?? sender;
  const content = text ?? '';
  const formattedMessage = {
    role: role?.toLowerCase() === 'user' ? 'user' : 'assistant',
    content,
  };

  if (_name) {
    formattedMessage.name = _name;
  }

  if (userName && formattedMessage.role === 'user') {
    formattedMessage.name = userName;
  }

  if (assistantName && formattedMessage.role === 'assistant') {
    formattedMessage.name = assistantName;
  }

  return formattedMessage;
};

module.exports = {
  formatMessage,
  escapeBraces,
  getSnippet,
};
