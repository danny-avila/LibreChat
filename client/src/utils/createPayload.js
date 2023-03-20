export default function createPayload({ convo, message }) {
  const endpoint = `/api/ask`;
  let payload = { ...message };
  const { model } = message;

  if (!payload.conversationId)
    if (convo?.conversationId && convo?.parentMessageId) {
      payload = {
        conversationId: convo.conversationId,
        parentMessageId: convo.parentMessageId || '00000000-0000-0000-0000-000000000000',
        ...payload
      };
    }

  const isBing = model === 'bingai' || model === 'sydney';
  if (isBing && convo?.conversationId) {
    payload = {
      ...payload,
      jailbreakConversationId: convo.jailbreakConversationId,
      conversationId: convo.conversationId,
      conversationSignature: convo.conversationSignature,
      clientId: convo.clientId,
      invocationId: convo.invocationId
    };
  }

  let server = endpoint;
  server = model === 'bingai' ? server + '/bing' : server;
  server = model === 'sydney' ? server + '/sydney' : server;
  return { server, payload };
};
