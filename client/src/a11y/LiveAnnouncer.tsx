import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { findLastSeparatorIndex } from 'librechat-data-provider';
import type { AnnounceOptions } from '~/Providers/AnnouncerContext';
import AnnouncerContext from '~/Providers/AnnouncerContext';
import useLocalize from '~/hooks/useLocalize';
import Announcer from './Announcer';

interface LiveAnnouncerProps {
  children: React.ReactNode;
}

interface AnnouncementItem {
  message: string;
  id: string;
  isAssertive: boolean;
}

const CHUNK_SIZE = 50;
const MIN_ANNOUNCEMENT_DELAY = 400;

const LiveAnnouncer: React.FC<LiveAnnouncerProps> = ({ children }) => {
  const [politeMessageId, setPoliteMessageId] = useState('');
  const [assertiveMessageId, setAssertiveMessageId] = useState('');
  const [announcePoliteMessage, setAnnouncePoliteMessage] = useState('');
  const [announceAssertiveMessage, setAnnounceAssertiveMessage] = useState('');

  const counterRef = useRef(0);
  const isAnnouncingRef = useRef(false);
  const politeProcessedTextRef = useRef('');
  const queueRef = useRef<AnnouncementItem[]>([]);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const localize = useLocalize();

  const generateUniqueId = (prefix: string) => {
    counterRef.current += 1;
    return `${prefix}-${counterRef.current}`;
  };

  const processChunks = (text: string, processedTextRef: React.MutableRefObject<string>) => {
    const remainingText = text.slice(processedTextRef.current.length);

    if (remainingText.length < CHUNK_SIZE) {
      return ''; /* Not enough characters to process */
    }

    let separatorIndex = -1;
    let startIndex = CHUNK_SIZE;

    while (separatorIndex === -1 && startIndex <= remainingText.length) {
      separatorIndex = findLastSeparatorIndex(remainingText.slice(startIndex));
      if (separatorIndex !== -1) {
        separatorIndex += startIndex; /* Adjust the index to account for the starting position */
      } else {
        startIndex += CHUNK_SIZE; /* Move the starting position by another CHUNK_SIZE characters */
      }
    }

    if (separatorIndex === -1) {
      return ''; /* No separator found, wait for more text */
    }

    const chunkText = remainingText.slice(0, separatorIndex + 1);
    processedTextRef.current += chunkText;
    return chunkText.trim();
  };

  const events = useMemo(
    () => ({ start: localize('com_a11y_start'), end: localize('com_a11y_end') }),
    [localize],
  );

  const announceNextInQueue = useCallback(() => {
    if (queueRef.current.length > 0 && !isAnnouncingRef.current) {
      isAnnouncingRef.current = true;
      const nextAnnouncement = queueRef.current.shift();
      if (nextAnnouncement) {
        const { message: _msg, id, isAssertive } = nextAnnouncement;
        const setMessage = isAssertive ? setAnnounceAssertiveMessage : setAnnouncePoliteMessage;
        const setMessageId = isAssertive ? setAssertiveMessageId : setPoliteMessageId;

        setMessage('');
        setMessageId('');

        /* Force a re-render before setting the new message */
        setTimeout(() => {
          const message = events[_msg] ?? _msg;
          setMessage(message);
          setMessageId(id);

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
  }, [events]);

  const addToQueue = useCallback(
    (item: AnnouncementItem) => {
      queueRef.current.push(item);
      announceNextInQueue();
    },
    [announceNextInQueue],
  );

  const announcePolite = useCallback(
    ({ message, id, isStream = false, isComplete = false }: AnnounceOptions) => {
      const announcementId = id ?? generateUniqueId('polite');
      if (isStream) {
        const chunk = processChunks(message, politeProcessedTextRef);
        if (chunk) {
          addToQueue({ message: chunk, id: announcementId, isAssertive: false });
        }
      } else if (isComplete) {
        const remainingText = message.slice(politeProcessedTextRef.current.length);
        if (remainingText.trim()) {
          addToQueue({ message: remainingText.trim(), id: announcementId, isAssertive: false });
        }
        politeProcessedTextRef.current = '';
      } else {
        addToQueue({ message, id: announcementId, isAssertive: false });
        politeProcessedTextRef.current = '';
      }
    },
    [addToQueue],
  );

  const announceAssertive = useCallback(
    ({ message, id }: AnnounceOptions) => {
      const announcementId = id ?? generateUniqueId('assertive');
      addToQueue({ message, id: announcementId, isAssertive: true });
    },
    [addToQueue],
  );

  const contextValue = {
    announcePolite,
    announceAssertive,
  };

  useEffect(() => {
    return () => {
      queueRef.current = [];
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
