import { SSE } from '../../app/sse';
const endpoint = 'http://localhost:3050/ask';

export default function handleSubmit({
  model,
  text,
  convo,
  messageHandler,
  convoHandler,
  errorHandler
}) {
  let payload = { model, text };
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
    const text = data.text || data.response;
    if (data.message) {
      messageHandler(text);
    } else if (data.final) {
      console.log(data);
      convoHandler(data);
    } else {
      console.log('initial', data);
    }
  };

  events.onerror = function (e) {
    console.log('error in opening conn.');
    events.close();
    errorHandler(e);
  };

  events.stream();
}