import React from 'react';
import AnnouncerContext from '~/Providers/AnnouncerContext';

interface LiveMessengerProps {
  children: (context: React.ContextType<typeof AnnouncerContext>) => React.ReactNode;
}

const LiveMessenger: React.FC<LiveMessengerProps> = ({ children }) => (
  <AnnouncerContext.Consumer>{(contextProps) => children(contextProps)}</AnnouncerContext.Consumer>
);

export default LiveMessenger;
