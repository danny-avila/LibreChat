import React, { useState, useCallback } from 'react';
import Announcer from './Announcer';
import AnnouncerContext from '~/Providers/AnnouncerContext';

interface LiveAnnouncerProps {
  children: React.ReactNode;
}

const LiveAnnouncer: React.FC<LiveAnnouncerProps> = ({ children }) => {
  const [announcePoliteMessage, setAnnouncePoliteMessage] = useState('');
  const [politeMessageId, setPoliteMessageId] = useState('');
  const [announceAssertiveMessage, setAnnounceAssertiveMessage] = useState('');
  const [assertiveMessageId, setAssertiveMessageId] = useState('');

  const announcePolite = useCallback((message: string, id?: string) => {
    setAnnouncePoliteMessage(message);
    setPoliteMessageId(id || '');
  }, []);

  const announceAssertive = useCallback((message: string, id?: string) => {
    setAnnounceAssertiveMessage(message);
    setAssertiveMessageId(id || '');
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
