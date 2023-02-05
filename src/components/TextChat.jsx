import React from 'react';
import EventSource from 'eventsource';

export default function TextChat() {
  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && e.shiftKey) {
      console.log('Enter + Shift');
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      console.log('Submit Enter');
    }
  };

  const handleSubmit = () => {
    const events = new EventSource('http://localhost:3050/ask');
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
  };

  return (
    <>
      <textarea
        className="m-10 h-16 p-4"
        onKeyUp={handleKeyPress}
        onChange={(e) => console.log(e.target.value)}
      />
    </>
  );
}
