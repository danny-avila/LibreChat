const { saveConvo } = require('~/models/Conversation');
const { isEnabled } = require('~/server/utils');

const addTitle = async (req, { text, responseText, conversationId, client }) => {
  const { TITLE_CONVO = 'true' } = process.env ?? {};
  if (!isEnabled(TITLE_CONVO)) {
    return;
  }

  if (client.options.titleConvo === false) {
    return;
  }

  const title = await client.titleConvo({ text, responseText });
  await saveConvo(req.user.id, {
    conversationId,
    title,
  });
};

module.exports = addTitle;
