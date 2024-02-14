import React from 'react';
import VeraMessage from './VeraMessage';

function VeraErrorMessage() {
  return (
    <VeraMessage>
      {' '}
      <div
        className="flex items-center justify-center max-w-max pl-4 pr-5 py-2 rounded"
        style={{
          background: '#EE422B1A',
        }}
      >
        Something went wrong. If the issue persists please contact your administrator.
      </div>
    </VeraMessage>
  );
}

export default VeraErrorMessage;
