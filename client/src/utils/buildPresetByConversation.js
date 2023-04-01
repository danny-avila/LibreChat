const buildPresetByConversation = ({ title, conversation, ...others }) => {
  const { endpoint } = conversation;

  let preset = {};
  if (endpoint === 'azureOpenAI' || endpoint === 'openAI') {
    preset = {
      endpoint,
      model: conversation?.model || 'gpt-3.5-turbo',
      chatGptLabel: conversation?.chatGptLabel || null,
      promptPrefix: conversation?.promptPrefix || null,
      temperature: conversation?.temperature || 1,
      top_p: conversation?.top_p || 1,
      presence_penalty: conversation?.presence_penalty || 0,
      frequency_penalty: conversation?.frequency_penalty || 0,
      title,
      ...others
    };
  } else if (endpoint === 'bingAI') {
    preset = {
      endpoint,
      jailbreak: conversation?.jailbreak || false,
      jailbreakConversationId: conversation?.jailbreakConversationId || null,
      conversationSignature: null,
      clientId: null,
      invocationId: 1,
      toneStyle: conversation?.toneStyle || 'fast',
      title,
      ...others
    };
  } else if (endpoint === 'chatGPTBrowser') {
    preset = {
      endpoint,
      model: conversation?.model || 'text-davinci-002-render-sha',
      title,
      ...others
    };
  } else if (endpoint === null) {
    preset = {
      ...conversation,
      endpoint,
      title,
      ...others
    };
  } else {
    console.error(`Unknown endpoint ${endpoint}`);
    preset = {
      endpoint: null,
      title,
      ...others
    };
  }

  return preset;
};

export default buildPresetByConversation;
