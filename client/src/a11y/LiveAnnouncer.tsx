import React, { useState, useCallback, useRef, useEffect } from 'react';
import { findLastSeparatorIndex } from 'librechat-data-provider';
import type { AnnounceOptions } from '~/Providers/AnnouncerContext';
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

  const politeProcessedTextRef = useRef('');
  const politeQueueRef = useRef<Array<{ message: string; id: string }>>([]);
  const isAnnouncingRef = useRef(false);
  const counterRef = useRef(0);

  const generateUniqueId = (prefix: string) => {
    counterRef.current += 1;
    return `${prefix}-${counterRef.current}`;
  };

  const processChunks = (text: string, processedTextRef: React.MutableRefObject<string>) => {
    const remainingText = text.slice(processedTextRef.current.length);
    const separatorIndex = findLastSeparatorIndex(remainingText);
    if (separatorIndex !== -1) {
      const chunkText = remainingText.slice(0, separatorIndex + 1);
      processedTextRef.current += chunkText;
      return chunkText.trim();
    }
    return '';
  };

  const announceNextInQueue = useCallback(() => {
    if (politeQueueRef.current.length > 0 && !isAnnouncingRef.current) {
      isAnnouncingRef.current = true;
      const nextAnnouncement = politeQueueRef.current.shift();
      if (nextAnnouncement) {
        setAnnouncePoliteMessage(nextAnnouncement.message);
        setPoliteMessageId(nextAnnouncement.id);
        setTimeout(() => {
          isAnnouncingRef.current = false;
          announceNextInQueue();
        }, 100);
      }
    }
  }, []);

  const announcePolite = useCallback(
    ({ message, id, isStream = false, isComplete = false }: AnnounceOptions) => {
      const announcementId = id ?? generateUniqueId('polite');
      if (isStream) {
        const chunk = processChunks(message, politeProcessedTextRef);
        if (chunk) {
          politeQueueRef.current.push({ message: chunk, id: announcementId });
          announceNextInQueue();
        }
      } else if (isComplete) {
        const remainingText = message.slice(politeProcessedTextRef.current.length);
        if (remainingText.trim()) {
          politeQueueRef.current.push({ message: remainingText.trim(), id: announcementId });
          announceNextInQueue();
        }
        politeProcessedTextRef.current = '';
      } else {
        politeQueueRef.current.push({ message, id: announcementId });
        announceNextInQueue();
        politeProcessedTextRef.current = '';
      }
    },
    [announceNextInQueue],
  );

  const announceAssertive = useCallback(({ message, id }: AnnounceOptions) => {
    const announcementId = id ?? generateUniqueId('assertive');
    setAnnounceAssertiveMessage(message);
    setAssertiveMessageId(announcementId);
  }, []);

  const contextValue = {
    announcePolite,
    announceAssertive,
  };

  useEffect(() => {
    return () => {
      politeQueueRef.current = [];
      isAnnouncingRef.current = false;
    };
  }, []);

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
