import { SSE } from './sse';
// const newLineRegex = /^\n+/;

export default function handleSubmit({
  model,
  text,
  convo,
  messageHandler,
  convoHandler,
  errorHandler,
  chatGptLabel,
  promptPrefix
}) {
  const endpoint = `http://localhost:3080/api/ask`;
  let payload = { model, text, chatGptLabel, promptPrefix };
  if (convo.conversationId && convo.parentMessageId) {
    payload = {
      ...payload,
      conversationId: convo.conversationId,
      parentMessageId: convo.parentMessageId
    };
  }

  const isBing = model === 'bingai' || model === 'sydney';
  if (isBing && convo.conversationId) {

    console.log('bing convo', convo);
    payload = {
      ...payload,
      jailbreakConversationId: convo.jailbreakConversationId,
      conversationId: convo.conversationId,
      conversationSignature: convo.conversationSignature,
      clientId: convo.clientId,
      invocationId: convo.invocationId,
    };
  }

  let server = endpoint;
  server = model === 'bingai' ? server + '/bing' : server;
  server = model === 'sydney' ? server + '/sydney' : server;
  
  const events = new SSE(server, {
    payload: JSON.stringify(payload),
    headers: { 'Content-Type': 'application/json' }
  });

  events.onopen = function () {
    console.log('connection is opened');
  };

  events.onmessage = function (e) {
    const data = JSON.parse(e.data);
    let text = data.text || data.response;
    if (data.message) {
      messageHandler(text);
    }

    if (data.final) {
      convoHandler(data);
      console.log('final', data);
    } else {
      // console.log('dataStream', data);
    }
  };

  events.onerror = function (e) {
    console.log('error in opening conn.');
    events.close();
    errorHandler(e);
  };

  events.stream();
}