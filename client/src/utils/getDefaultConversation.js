const buildDefaultConversation = ({ conversation, endpoint, lastConversationSetup = {} }) => {
  if (endpoint === 'azureOpenAI' || endpoint === 'openAI') {
    conversation = {
      ...conversation,
      endpoint,
      model: lastConversationSetup?.model || 'gpt-3.5-turbo',
      chatGptLabel: lastConversationSetup?.chatGptLabel || null,
      promptPrefix: lastConversationSetup?.promptPrefix || null,
      temperature: lastConversationSetup?.temperature || 0.8,
      top_p: lastConversationSetup?.top_p || 1,
      presence_penalty: lastConversationSetup?.presence_penalty || 1
    };
  } else if (endpoint === 'bingAI') {
    conversation = {
      ...conversation,
      endpoint,
      jailbreak: lastConversationSetup?.jailbreak || false,
      jailbreakConversationId: lastConversationSetup?.jailbreakConversationId || null,
      conversationSignature: lastConversationSetup?.conversationSignature || null,
      clientId: lastConversationSetup?.clientId || null,
      invocationId: lastConversationSetup?.invocationId || null,
      toneStyle: lastConversationSetup?.toneStyle || 'fast',
      suggestions: lastConversationSetup?.suggestions || []
    };
  } else if (endpoint === 'chatGPTBrowser') {
    conversation = {
      ...conversation,
      endpoint,
      model: lastConversationSetup?.model || 'text-davinci-002-render-sha'
    };
  } else if (endpoint === null) {
    conversation = {
      ...conversation,
      endpoint
    };
  } else {
    console.error(`Unknown endpoint ${endpoint}`);
    conversation = {
      ...conversation,
      endpoint: null
    };
  }

  return conversation;
};

const getDefaultConversation = ({ conversation, prevConversation, availableEndpoints }) => {
  try {
    // try to use current model
    const { endpoint = null } = prevConversation || {};
    if (endpoint in availableEndpoints) {
      conversation = buildDefaultConversation({
        conversation,
        endpoint,
        lastConversationSetup: prevConversation
      });
      return conversation;
    }
  } catch (error) {}

  try {
    // try to read latest selected model from local storage
    const lastConversationSetup = JSON.parse(localStorage.getItem('lastConversationSetup'));
    const { endpoint = null } = lastConversationSetup;

    if (endpoint in availableEndpoints) {
      conversation = buildDefaultConversation({ conversation, endpoint, lastConversationSetup });
      return conversation;
    }
  } catch (error) {}

  // if anything happens, reset to default model
  const endpoint = availableEndpoints?.[0];
  if (endpoint) {
    conversation = buildDefaultConversation({ conversation, endpoint });
    return conversation;
  } else {
    conversation = buildDefaultConversation({ conversation, endpoint: null });
    return conversation;
  }
};

export default getDefaultConversation;
