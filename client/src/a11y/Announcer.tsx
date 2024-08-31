// client/src/a11y/Announcer.tsx
import React from 'react';

interface AnnouncerProps {
  statusMessage: string;
  logMessage: string;
}

const Announcer: React.FC<AnnouncerProps> = ({ statusMessage, logMessage }) => {
  return (
    <div className="sr-only">
      <div aria-live="polite" aria-atomic="true">
        {statusMessage}
      </div>
      <div aria-live="polite" aria-atomic="true">
        {logMessage}
      </div>
    </div>
  );
};

export default Announcer;
