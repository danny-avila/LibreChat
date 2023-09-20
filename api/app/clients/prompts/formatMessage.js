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

module.exports = formatMessage;
