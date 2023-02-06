import React, { useState } from 'react';
import { SSE } from '../../app/sse';

const handleSubmit = (text, messageHandler, convo, convoHandler) => {
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
    } else {
      console.log(data);
      convoHandler(data);
    }
  };

  events.onerror = function (e) {
    console.log(e, 'error in opening conn.');
    events.close();
  };

  events.stream();
};

export default function TextChat({ messages, setMessages, conversation = null }) {
  const [text, setText] = useState('');
  const [convo, setConvo] = useState({ conversationId: null, parentMessageId: null });

  if (!!conversation) {
    setConvo(conversation);
  }

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && e.shiftKey) {
      console.log('Enter + Shift');
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      const payload = text.trim();
      const currentMsg = { sender: 'user', text: payload, current: true };
      setMessages([...messages, currentMsg]);
      setText('');
      const messageHandler = (data) => {
        setMessages([...messages, currentMsg, { sender: 'GPT', text: data }]);
      };
      const convoHandler = (data) => {
        if (convo.conversationId === null && convo.parentMessageId === null) {
          const { conversationId, parentMessageId } = data;
          setConvo({ conversationId, parentMessageId: data.id });
        }
      };
      console.log('User Input:', payload);
      handleSubmit(payload, messageHandler, convo, convoHandler);
    }
  };

  return (
    <>
      <textarea
        className="m-10 h-16 p-4"
        value={text}
        onKeyUp={handleKeyPress}
        onChange={(e) => setText(e.target.value)}
      />
    </>
  );
}
