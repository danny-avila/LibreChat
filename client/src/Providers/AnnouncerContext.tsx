// AnnouncerContext.tsx
import React from 'react';

export interface AnnounceOptions {
  message: string;
  id?: string;
  isStream?: boolean;
  isComplete?: boolean;
}

interface AnnouncerContextType {
  announceAssertive: (options: AnnounceOptions) => void;
  announcePolite: (options: AnnounceOptions) => void;
}

const defaultContext: AnnouncerContextType = {
  announceAssertive: () => console.warn('Announcement failed, LiveAnnouncer context is missing'),
  announcePolite: () => console.warn('Announcement failed, LiveAnnouncer context is missing'),
};

const AnnouncerContext = React.createContext<AnnouncerContextType>(defaultContext);

export const useLiveAnnouncer = () => {
  const context = React.useContext(AnnouncerContext);
  return context;
};

export default AnnouncerContext;
