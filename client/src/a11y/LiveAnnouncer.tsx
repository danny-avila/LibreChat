// client/src/a11y/LiveAnnouncer.tsx
import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import type { AnnounceOptions } from '~/Providers/AnnouncerContext';
import AnnouncerContext from '~/Providers/AnnouncerContext';
import useLocalize from '~/hooks/useLocalize';
import Announcer from './Announcer';

interface LiveAnnouncerProps {
  children: React.ReactNode;
}

const LiveAnnouncer: React.FC<LiveAnnouncerProps> = ({ children }) => {
  const [statusMessage, setStatusMessage] = useState('');
  const [logMessage, setLogMessage] = useState('');

  const statusTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const localize = useLocalize();

  const events: Record<string, string | undefined> = useMemo(
    () => ({
      start: localize('com_a11y_start'),
      end: localize('com_a11y_end'),
      composing: localize('com_a11y_ai_composing'),
    }),
    [localize],
  );

  const announceStatus = useCallback((message: string) => {
    if (statusTimeoutRef.current) {
      clearTimeout(statusTimeoutRef.current);
    }

    setStatusMessage(message);

    statusTimeoutRef.current = setTimeout(() => {
      setStatusMessage('');
    }, 1000);
  }, []);

  const announceLog = useCallback((message: string) => {
    setLogMessage(message);
  }, []);

  const announcePolite = useCallback(
    ({ message, isStatus = false }: AnnounceOptions) => {
      const finalMessage = (events[message] ?? message).replace(/[*`_]/g, '');

      if (isStatus) {
        announceStatus(finalMessage);
      } else {
        announceLog(finalMessage);
      }
    },
    [events, announceStatus, announceLog],
  );

  const announceAssertive = announcePolite;

  const contextValue = {
    announcePolite,
    announceAssertive,
  };

  useEffect(() => {
    return () => {
      if (statusTimeoutRef.current) {
        clearTimeout(statusTimeoutRef.current);
      }
    };
  }, []);

  return (
    <AnnouncerContext.Provider value={contextValue}>
      {children}
      <Announcer statusMessage={statusMessage} logMessage={logMessage} />
    </AnnouncerContext.Provider>
  );
};

export default LiveAnnouncer;
