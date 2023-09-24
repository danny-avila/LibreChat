const formatMessage = ({ message, userName, assistantName }) => {
  let { role: _role, _name, sender, text } = message;
  const content = text ?? '';
  const formattedMessage = {
    role: _role ?? sender?.toLowerCase() === 'user' ? 'user' : 'assistant',
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

module.exports = formatMessage;
