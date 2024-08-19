import React from 'react';
import MessageBlock from './MessageBlock';

interface AnnouncerProps {
  politeMessage: string;
  politeMessageId: string;
  assertiveMessage: string;
  assertiveMessageId: string;
}

const Announcer: React.FC<AnnouncerProps> = ({ politeMessage, assertiveMessage }) => {
  return (
    <div>
      <MessageBlock aria-live="assertive" aria-atomic="true" message={assertiveMessage} />
      <MessageBlock aria-live="polite" aria-atomic="false" message={politeMessage} />
    </div>
  );
};

export default Announcer;
