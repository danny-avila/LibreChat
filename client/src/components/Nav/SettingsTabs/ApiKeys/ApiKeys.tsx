import React from 'react';
import { SovereignApiKeys } from './SovereignApiKeys';

function ApiKeys() {
  return (
    <div className="flex flex-col gap-3 p-1 text-sm text-text-primary">
      <div className="pb-3">
        <SovereignApiKeys />
      </div>
    </div>
  );
}

export default React.memo(ApiKeys);
