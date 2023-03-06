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
  const endpoint = `http://localhost:3080/ask`;
  let payload = { model, text, chatGptLabel, promptPrefix };
  if (convo.conversationId && convo.parentMessageId) {
    payload = {
      ...payload,
      conversationId: convo.conversationId,
      parentMessageId: convo.parentMessageId
    };
  }

  if (model === 'bingai' && convo.conversationId) {
    payload = {
      ...payload,
      conversationId: convo.conversationId,
      conversationSignature: convo.conversationSignature,
      clientId: convo.clientId,
      invocationId: convo.invocationId,
    };
  }

  const server = model === 'bingai' ? endpoint + '/bing' : endpoint;
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