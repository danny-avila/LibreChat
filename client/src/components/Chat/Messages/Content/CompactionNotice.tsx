import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface CompactionNoticeProps {
  droppedCount: number;
  remaining: number;
}

const CompactionNotice: React.FC<CompactionNoticeProps> = ({ droppedCount, remaining }) => {
  return (
    <div className="my-3 flex items-center gap-2.5 rounded-lg border border-orange-400/30 bg-orange-500/10 px-3 py-2 text-sm text-orange-300">
      <AlertTriangle className="h-4 w-4 shrink-0 text-orange-400" aria-hidden="true" />
      <span className="select-none">
        {`Context compacted \u2014 ${droppedCount} older message(s) removed, continuing with ${remaining} most recent.`}
      </span>
    </div>
  );
};

export default CompactionNotice;
