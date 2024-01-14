const { saveConvo } = require('~/models');
const { isEnabled } = require('~/server/utils');

const addTitle = async (req, { text, response, client }) => {
  const { TITLE_CONVO = 'true' } = process.env ?? {};
  if (!isEnabled(TITLE_CONVO)) {
    return;
  }

  if (client.options.titleConvo === false) {
    return;
  }

  // If the request was aborted and is not azure, don't generate the title.
  if (!client.azure && client.abortController.signal.aborted) {
    return;
  }

  const title = await client.titleConvo({ text, responseText: response?.text });
  await saveConvo(req.user.id, {
    conversationId: response.conversationId,
    title,
  });
};

module.exports = addTitle;
