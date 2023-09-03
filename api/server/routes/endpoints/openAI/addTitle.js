const throttle = require('lodash/throttle');
const { saveConvo } = require('../../../../models');

const addTitle = async (req, { text, response, client }) => {
  const title = await client.titleConvo({ text, responseText: response?.text });
  await saveConvo(req.user.id, {
    conversationId: response.conversationId,
    title,
  });
};

const throttledFunction = throttle(addTitle, 1000);

module.exports = throttledFunction;
