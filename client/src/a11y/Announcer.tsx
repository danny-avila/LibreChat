// client/src/a11y/Announcer.tsx
import React from 'react';

interface AnnouncerProps {
  statusMessage: string;
  responseMessage: string;
}

const Announcer: React.FC<AnnouncerProps> = ({ statusMessage, responseMessage }) => {
  return (
    <div className="sr-only">
      <div aria-live="assertive" aria-atomic="true">
        {statusMessage}
      </div>
      <div aria-live="polite" aria-atomic="true">
        {responseMessage}
      </div>
    </div>
  );
};

export default Announcer;
