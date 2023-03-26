export default function createPayload(submission) {
  const {
    conversation,
    messages,
    message,
    initialResponse,
    isRegenerate = false,
  } = submission;

  const endpoint = `/api/ask`;
  const {
    model,
    chatGptLabel,
    promptPrefix,
    jailbreakConversationId,
    conversationId,
    conversationSignature,
    clientId,
    invocationId,
  } = conversation;

  let payload = {
    ...message,
    ...{
      model,
      chatGptLabel,
      promptPrefix,
      conversationId,
    },
  };

  // if (!payload.conversationId)
  //   if (conversation?.conversationId) {
  //     payload = {
  //       ...payload,
  //       conversationId: convo.conversationId,
  //       parentMessageId: convo.parentMessageId || '00000000-0000-0000-0000-000000000000'
  //     };
  //   }

  const isBing = model === "bingai" || model === "sydney";
  if (isBing && conversationId) {
    payload = {
      ...payload,
      jailbreakConversationId,
      conversationSignature,
      clientId,
      invocationId,
    };
  }

  let server = endpoint;
  server = model === "bingai" ? server + "/bing" : server;
  server = model === "sydney" ? server + "/sydney" : server;
  return { server, payload };
}
