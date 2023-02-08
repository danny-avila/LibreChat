import { SSE } from '../../app/sse';

export default function handleSubmit({
  text,
  convo,
  messageHandler,
  convoHandler,
  errorHandler
}) {
  let payload = { text };
  if (convo.conversationId && convo.parentMessageId) {
    payload = {
      ...payload,
      conversationId: convo.conversationId,
      parentMessageId: convo.parentMessageId
    };
  }

  const events = new SSE('http://localhost:3050/ask', {
    payload: JSON.stringify(payload),
    headers: { 'Content-Type': 'application/json' }
  });

  events.onopen = function () {
    console.log('connection is opened');
  };

  events.onmessage = function (e) {
    const data = JSON.parse(e.data);
    if (!!data.message) {
      messageHandler(data.text.replace(/^\n/, ''));
    } else if (!data.initial) {
      console.log(data);
      convoHandler(data);
    } else {
      console.log('initial', data);
    }
  };

  events.onerror = function (e) {
    console.log(e, 'error in opening conn.');
    events.close();
    errorHandler(e);
  };

  events.stream();
}
