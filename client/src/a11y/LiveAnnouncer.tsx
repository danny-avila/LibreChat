import React, { useState, useCallback, useRef, useEffect } from 'react';
import { findLastSeparatorIndex } from 'librechat-data-provider';
import type { AnnounceOptions } from '~/Providers/AnnouncerContext';
import AnnouncerContext from '~/Providers/AnnouncerContext';
import Announcer from './Announcer';

interface LiveAnnouncerProps {
  children: React.ReactNode;
}

const CHUNK_SIZE = 50;
const MIN_ANNOUNCEMENT_DELAY = 100;

const LiveAnnouncer: React.FC<LiveAnnouncerProps> = ({ children }) => {
  const [announcePoliteMessage, setAnnouncePoliteMessage] = useState('');
  const [politeMessageId, setPoliteMessageId] = useState('');
  const [announceAssertiveMessage, setAnnounceAssertiveMessage] = useState('');
  const [assertiveMessageId, setAssertiveMessageId] = useState('');

  const politeProcessedTextRef = useRef('');
  const politeQueueRef = useRef<Array<{ message: string; id: string }>>([]);
  const isAnnouncingRef = useRef(false);
  const counterRef = useRef(0);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const generateUniqueId = (prefix: string) => {
    counterRef.current += 1;
    return `${prefix}-${counterRef.current}`;
  };

  const processChunks = (text: string, processedTextRef: React.MutableRefObject<string>) => {
    const remainingText = text.slice(processedTextRef.current.length);

    if (remainingText.length < CHUNK_SIZE) {
      return ''; // Not enough characters to process
    }

    let separatorIndex = -1;
    let startIndex = CHUNK_SIZE;

    while (separatorIndex === -1 && startIndex <= remainingText.length) {
      separatorIndex = findLastSeparatorIndex(remainingText.slice(startIndex));
      if (separatorIndex !== -1) {
        separatorIndex += startIndex; // Adjust the index to account for the starting position
      } else {
        startIndex += CHUNK_SIZE; // Move the starting position by another CHUNK_SIZE characters
      }
    }

    if (separatorIndex === -1) {
      return ''; // No separator found, wait for more text
    }

    const chunkText = remainingText.slice(0, separatorIndex + 1);
    processedTextRef.current += chunkText;
    return chunkText.trim();
  };

  const announceNextInQueue = useCallback(() => {
    if (politeQueueRef.current.length > 0 && !isAnnouncingRef.current) {
      isAnnouncingRef.current = true;
      const nextAnnouncement = politeQueueRef.current.shift();
      if (nextAnnouncement) {
        setAnnouncePoliteMessage('');
        setPoliteMessageId('');

        // Force a re-render before setting the new message
        setTimeout(() => {
          setAnnouncePoliteMessage(nextAnnouncement.message);
          setPoliteMessageId(nextAnnouncement.id);

          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
          }

          timeoutRef.current = setTimeout(() => {
            isAnnouncingRef.current = false;
            announceNextInQueue();
          }, MIN_ANNOUNCEMENT_DELAY);
        }, 0);
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
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
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
