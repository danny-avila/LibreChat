import { useState, useEffect } from 'react';
import * as Popover from '@radix-ui/react-popover';
import ProgressCircle from './ProgressCircle';
import ProgressText from './ProgressText';
import FinishedIcon from './FinishedIcon';
import ToolPopover from './ToolPopover';
import ActionIcon from './ActionIcon';
import WrenchIcon from './WrenchIcon';
import { useProgress } from '~/hooks';

export default function ToolCall({
  initialProgress = 0.1,
  name,
  args = '',
  output,
}: {
  initialProgress: number;
  name: string;
  args: string;
  output?: string | null;
}) {
  const progress = useProgress(initialProgress);
  const radius = 56.08695652173913;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - progress * circumference;

  return (
    <Popover.Root>
      <div className="my-2.5 flex items-center gap-2.5">
        <div className="relative h-5 w-5 shrink-0">
          {progress < 1 ? (
            <div
              className="absolute left-0 top-0 flex h-full w-full items-center justify-center rounded-full bg-transparent text-white"
              style={{ opacity: 1, transform: 'none' }}
              data-projection-id="849"
            >
              <div>
                <WrenchIcon />
              </div>
              <ProgressCircle radius={radius} circumference={circumference} offset={offset} />
            </div>
          ) : (
            <FinishedIcon />
          )}
        </div>
        <ProgressText
          progress={progress}
          onClick={() => ({})}
          inProgressText="Running"
          finishedText="Finished running"
          hasInput={!!args?.length}
          popover={true}
        />
        {!!args?.length && <ToolPopover input={args} output={output} />}
      </div>
    </Popover.Root>
  );
}
