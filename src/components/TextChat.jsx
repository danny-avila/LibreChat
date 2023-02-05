import React, { useState } from 'react';
import { SSE } from '../../app/sse';

const handleSubmit = (payload) => {
  const events = new SSE('http://localhost:3050/ask', {
    payload: JSON.stringify({ text: payload }),
    headers: { 'Content-Type': 'application/json' }
  });
  console.log('we in handleSubmit');
  events.onopen = function () {
    console.log('connection is opened');
  };

  events.onmessage = function (e) {
    console.log(e);
  };

  events.onerror = function (e) {
    console.log(e, 'error in opening conn.');
    events.close();
  };

  events.stream();
};

export default function TextChat() {
  const [text, setText] = useState('');

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && e.shiftKey) {
      console.log('Enter + Shift');
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      console.log('Submit Enter');
      handleSubmit(text);
    }
  };

  return (
    <>
      <textarea
        className="m-10 h-16 p-4"
        onKeyUp={handleKeyPress}
        onChange={(e) => setText(e.target.value)}
      />
    </>
  );
}
