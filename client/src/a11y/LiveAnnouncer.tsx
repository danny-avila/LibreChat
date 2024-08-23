/* client/src/a11y/LiveAnnouncer.tsx */
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

/** Chunk size for processing text */
const CHUNK_SIZE = 200;
/** Minimum delay between announcements */
const MIN_ANNOUNCEMENT_DELAY = 1000;
/** Delay before clearing the live region */
const CLEAR_DELAY = 5000;
/** Regex to remove *, `, and _ from message text */
const replacementRegex = /[*`_]/g;

const LiveAnnouncer: React.FC<LiveAnnouncerProps> = ({ children }) => {
  const [statusMessage, setStatusMessage] = useState('');
  const [responseMessage, setResponseMessage] = useState('');

  const counterRef = useRef(0);
  const isAnnouncingRef = useRef(false);
  const politeProcessedTextRef = useRef('');
  const queueRef = useRef<AnnouncementItem[]>([]);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastAnnouncementTimeRef = useRef(0);

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

  /** Localized event announcements, i.e., "the AI is replying, finished, etc." */
  const events: Record<string, string | undefined> = useMemo(
    () => ({ start: localize('com_a11y_start'), end: localize('com_a11y_end') }),
    [localize],
  );

  const announceMessage = useCallback((message: string, isAssertive: boolean) => {
    const setMessage = isAssertive ? setStatusMessage : setResponseMessage;
    setMessage(message);

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    lastAnnouncementTimeRef.current = Date.now();

    timeoutRef.current = setTimeout(() => {
      isAnnouncingRef.current = false;
      setMessage(''); /* Clear the message after a delay */
      announceNextInQueue();
    }, CLEAR_DELAY);
  }, []);

  const announceNextInQueue = useCallback(() => {
    if (queueRef.current.length > 0 && !isAnnouncingRef.current) {
      const now = Date.now();
      const timeSinceLastAnnouncement = now - lastAnnouncementTimeRef.current;

      if (timeSinceLastAnnouncement < MIN_ANNOUNCEMENT_DELAY) {
        /* If not enough time has passed, schedule the next announcement */
        setTimeout(announceNextInQueue, MIN_ANNOUNCEMENT_DELAY - timeSinceLastAnnouncement);
        return;
      }

      isAnnouncingRef.current = true;

      /* Check for assertive messages first */
      const assertiveIndex = queueRef.current.findIndex((item) => item.isAssertive);
      const nextAnnouncement =
        assertiveIndex !== -1
          ? queueRef.current.splice(assertiveIndex, 1)[0]
          : queueRef.current.shift();

      if (nextAnnouncement) {
        const { message: _msg, isAssertive } = nextAnnouncement;
        const message = (events[_msg] ?? _msg).replace(replacementRegex, '');
        announceMessage(message, isAssertive);
      }
    }
  }, [events, announceMessage]);

  const addToQueue = useCallback(
    (item: AnnouncementItem) => {
      if (item.isAssertive) {
        /* For assertive messages, clear the queue and announce immediately */
        queueRef.current = [item];
        if (!isAnnouncingRef.current) {
          announceNextInQueue();
        }
      } else {
        queueRef.current.push(item);
        if (!isAnnouncingRef.current) {
          announceNextInQueue();
        }
      }
    },
    [announceNextInQueue],
  );

  const announcePolite = useCallback(
    ({ message, id, isStream = false, isComplete = false }: AnnounceOptions) => {
      const announcementId = id ?? generateUniqueId('polite');
      if (isStream || isComplete) {
        const chunk = processChunks(message, politeProcessedTextRef);
        if (chunk) {
          addToQueue({ message: chunk, id: announcementId, isAssertive: false });
        }
        if (isComplete) {
          const remainingText = message.slice(politeProcessedTextRef.current.length);
          if (remainingText.trim()) {
            addToQueue({ message: remainingText.trim(), id: announcementId, isAssertive: false });
          }
          politeProcessedTextRef.current = '';
        }
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
      <Announcer statusMessage={statusMessage} responseMessage={responseMessage} />
    </AnnouncerContext.Provider>
  );
};

export default LiveAnnouncer;
