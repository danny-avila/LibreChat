const buildDefaultConversation = ({
  conversation,
  endpoint,
  endpointsConfig = {},
  lastConversationSetup = {}
}) => {
  const lastSelectedModel = JSON.parse(localStorage.getItem('lastSelectedModel')) || {};

  if (endpoint === 'azureOpenAI' || endpoint === 'openAI') {
    conversation = {
      ...conversation,
      endpoint,
      model:
        lastConversationSetup?.model ??
        lastSelectedModel[endpoint] ??
        endpointsConfig[endpoint]?.availableModels?.[0] ??
        'gpt-3.5-turbo',
      chatGptLabel: lastConversationSetup?.chatGptLabel ?? null,
      promptPrefix: lastConversationSetup?.promptPrefix ?? null,
      temperature: lastConversationSetup?.temperature ?? 1,
      top_p: lastConversationSetup?.top_p ?? 1,
      presence_penalty: lastConversationSetup?.presence_penalty ?? 0,
      frequency_penalty: lastConversationSetup?.frequency_penalty ?? 0
    };
  } else if (endpoint === 'google') {
    conversation = {
      ...conversation,
      endpoint,
      model:
        lastConversationSetup?.model ??
        lastSelectedModel[endpoint] ??
        endpointsConfig[endpoint]?.availableModels?.[0] ??
        'chat-bison',
      modelLabel: lastConversationSetup?.modelLabel ?? null,
      promptPrefix: lastConversationSetup?.promptPrefix ?? null,
      temperature: lastConversationSetup?.temperature ?? 0.2,
      topP: lastConversationSetup?.topP ?? 0.95,
      topK: lastConversationSetup?.topK ?? 40,
    };
  } else if (endpoint === 'bingAI') {
    conversation = {
      ...conversation,
      endpoint,
      jailbreak: lastConversationSetup?.jailbreak ?? false,
      context: lastConversationSetup?.context ?? null,
      systemMessage: lastConversationSetup?.systemMessage ?? null,
      toneStyle: lastConversationSetup?.toneStyle ?? 'fast',
      jailbreakConversationId: lastConversationSetup?.jailbreakConversationId ?? null,
      conversationSignature: null,
      clientId: null,
      invocationId: 1
    };
  } else if (endpoint === 'chatGPTBrowser') {
    conversation = {
      ...conversation,
      endpoint,
      model:
        lastConversationSetup?.model ??
        lastSelectedModel[endpoint] ??
        endpointsConfig[endpoint]?.availableModels?.[0] ??
        'text-davinci-002-render-sha'
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

const getDefaultConversation = ({ conversation, prevConversation, endpointsConfig, preset }) => {
  const { endpoint: targetEndpoint } = preset || {};

  if (targetEndpoint) {
    // try to use preset
    const endpoint = targetEndpoint;
    if (endpointsConfig?.[endpoint]) {
      conversation = buildDefaultConversation({
        conversation,
        endpoint,
        lastConversationSetup: preset,
        endpointsConfig
      });
      return conversation;
    } else {
      console.log(endpoint);
      console.warn(`Illegal target endpoint ${targetEndpoint} ${endpointsConfig}`);
    }
  }

  // try {
  //   // try to use current model
  //   const { endpoint = null } = prevConversation || {};
  //   if (endpointsConfig?.[endpoint]) {
  //     conversation = buildDefaultConversation({
  //       conversation,
  //       endpoint,
  //       lastConversationSetup: prevConversation,
  //       endpointsConfig
  //     });
  //     return conversation;
  //   }
  // } catch (error) {}

  try {
    // try to read latest selected model from local storage
    const lastConversationSetup = JSON.parse(localStorage.getItem('lastConversationSetup'));
    const { endpoint = null } = lastConversationSetup;

    if (endpointsConfig?.[endpoint]) {
      conversation = buildDefaultConversation({ conversation, endpoint, endpointsConfig });
      return conversation;
    }
  } catch (error) {}

  // if anything happens, reset to default model

  const endpoint = ['openAI', 'azureOpenAI', 'bingAI', 'chatGPTBrowser', 'google'].find(e => endpointsConfig?.[e]);
  if (endpoint) {
    conversation = buildDefaultConversation({ conversation, endpoint, endpointsConfig });
    return conversation;
  } else {
    conversation = buildDefaultConversation({ conversation, endpoint: null, endpointsConfig });
    return conversation;
  }
};

export default getDefaultConversation;
