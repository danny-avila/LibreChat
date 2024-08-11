import React from 'react';

interface AnnouncerContextType {
  announceAssertive: (message: string, id?: string) => void;
  announcePolite: (message: string, id?: string) => void;
}

const defaultContext: AnnouncerContextType = {
  announceAssertive: () => console.warn('Announcement failed, LiveAnnouncer context is missing'),
  announcePolite: () => console.warn('Announcement failed, LiveAnnouncer context is missing'),
};

const AnnouncerContext = React.createContext<AnnouncerContextType>(defaultContext);

export const useLiveAnnouncer = () => {
  const context = React.useContext(AnnouncerContext);
  if (context === undefined) {
    throw new Error('useLiveAnnouncer must be used within a LiveAnnouncer');
  }
  return context;
};

export default AnnouncerContext;
