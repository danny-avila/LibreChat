// LiveAnnouncer.tsx
import React, { useState, useCallback, useRef } from 'react';
import AnnouncerContext from '~/Providers/AnnouncerContext';
import Announcer from './Announcer';

interface LiveAnnouncerProps {
  children: React.ReactNode;
}

const LiveAnnouncer: React.FC<LiveAnnouncerProps> = ({ children }) => {
  const [announcePoliteMessage, setAnnouncePoliteMessage] = useState('');
  const [politeMessageId, setPoliteMessageId] = useState('');
  const [announceAssertiveMessage, setAnnounceAssertiveMessage] = useState('');
  const [assertiveMessageId, setAssertiveMessageId] = useState('');

  const lastPoliteMessageRef = useRef('');
  const lastAssertiveMessageRef = useRef('');

  const getNewContent = (currentMessage: string, lastMessage: string) => {
    let newContent = currentMessage.slice(lastMessage.length);

    // If the new content starts with a partial word, include the last word from the previous message
    if (newContent.length > 0 && !/^\s/.test(newContent) && lastMessage.length > 0) {
      const lastWordOfPrevious = lastMessage.split(/\s+/).pop() || '';
      newContent = lastWordOfPrevious + newContent;
    }

    // If the new content ends with a partial word, remove it
    const words = newContent.split(/\s+/);
    if (words.length > 1 && currentMessage.endsWith(words[words.length - 1])) {
      words.pop();
      newContent = words.join(' ');
    }

    // Preserve original spacing
    newContent = newContent.replace(/\s+/g, ' ').trim();

    return newContent;
  };

  const announcePolite = useCallback((message: string, id?: string, isStream?: boolean) => {
    if (isStream === true) {
      const newContent = getNewContent(message, lastPoliteMessageRef.current);
      if (newContent) {
        setAnnouncePoliteMessage(newContent);
      }
    } else {
      setAnnouncePoliteMessage(message);
    }
    lastPoliteMessageRef.current = message;
    setPoliteMessageId(id ?? '');
  }, []);

  const announceAssertive = useCallback((message: string, id?: string, isStream?: boolean) => {
    if (isStream === true) {
      const newContent = getNewContent(message, lastAssertiveMessageRef.current);
      if (newContent) {
        setAnnounceAssertiveMessage(newContent);
      }
    } else {
      setAnnounceAssertiveMessage(message);
    }
    lastAssertiveMessageRef.current = message;
    setAssertiveMessageId(id ?? '');
  }, []);

  const contextValue = {
    announcePolite,
    announceAssertive,
  };

  return (
    <AnnouncerContext.Provider value={contextValue}>
      {children}
      <Announcer
        assertiveMessage={announceAssertiveMessage}
        assertiveMessageId={assertiveMessageId}
        politeMessage={announcePoliteMessage}
        politeMessageId={politeMessageId}
      />
    </AnnouncerContext.Provider>
  );
};

export default LiveAnnouncer;
