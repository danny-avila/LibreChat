import React from 'react';
import VeraSpinner from '~/components/svg/VeraSpinner';
import VeraMessage from './VeraMessage';

function ProcessingSpinner({ event }) {
  return (
    <VeraMessage>
      {' '}
      <div
        className="flex items-center justify-center max-w-max pl-4 pr-5 py-2 rounded-full"
        style={{
          background:
            ' radial-gradient(96.65% 96.65% at -2.56% 24.88%, rgba(63, 90, 255, 0.1) 0%, rgba(25, 216, 202, 0.1) 100%) ',
        }}
      >
        <VeraSpinner className="mr-1" /> {event}
      </div>
    </VeraMessage>
  );
}

export default ProcessingSpinner;
