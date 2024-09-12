import { memo } from 'react';
import CodeArtifacts from './CodeArtifacts';

function Beta() {
  return (
    <div className="flex flex-col gap-3 p-1 text-sm text-text-primary">
      <div className="border-b border-border-medium pb-3 last-of-type:border-b-0">
        <CodeArtifacts />
      </div>
    </div>
  );
}

export default memo(Beta);
