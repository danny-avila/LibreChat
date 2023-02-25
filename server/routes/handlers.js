const handleError = (res, errorMessage) => {
  res.status(500).write(`event: error\ndata: ${errorMessage}`);
  res.end();
};

const sendMessage = (res, message) => {
  if (message.length === 0) {
    return;
  }
  res.write(`event: message\ndata: ${JSON.stringify(message)}\n\n`);
};

module.exports = { handleError, sendMessage };
