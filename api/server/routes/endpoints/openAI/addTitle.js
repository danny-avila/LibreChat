const { titleConvo } = require('../../../../app');
const { saveConvo } = require('../../../../models');

const addTitle = async (
  req,
  { text, azure, response, newConvo, parentMessageId, openAIApiKey },
) => {
  if (parentMessageId == '00000000-0000-0000-0000-000000000000' && newConvo) {
    const title = await titleConvo({
      text,
      azure,
      response,
      openAIApiKey,
    });
    await saveConvo(req.user.id, {
      conversationId: response.conversationId,
      title,
    });
  }
};

module.exports = addTitle;
