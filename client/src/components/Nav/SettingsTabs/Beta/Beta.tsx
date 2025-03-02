import { memo } from 'react';
import CodeArtifacts from './CodeArtifacts';

function Beta() {
  return (
    <div className="flex flex-col gap-3 p-1 text-sm text-text-primary">
      <div className="pb-3">
        <CodeArtifacts />
      </div>
    </div>
  );
}

export default memo(Beta);
