// import { useState, useEffect } from 'react';
import { actionDelimiter, actionDomainSeparator, Constants } from 'librechat-data-provider';
import * as Popover from '@radix-ui/react-popover';
import useLocalize from '~/hooks/useLocalize';
import ProgressCircle from './ProgressCircle';
import InProgressCall from './InProgressCall';
import CancelledIcon from './CancelledIcon';
import ProgressText from './ProgressText';
import FinishedIcon from './FinishedIcon';
import ToolPopover from './ToolPopover';
// import ActionIcon from './ActionIcon';
import WrenchIcon from './WrenchIcon';
import { useProgress } from '~/hooks';

export default function ToolCall({
  initialProgress = 0.1,
  isSubmitting,
  name,
  args = '',
  output,
}: {
  initialProgress: number;
  isSubmitting: boolean;
  name: string;
  args: string;
  output?: string | null;
}) {
  const localize = useLocalize();
  const progress = useProgress(initialProgress);
  const radius = 56.08695652173913;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - progress * circumference;

  const [function_name, _domain] = name.split(actionDelimiter);
  const domain = _domain?.replaceAll(actionDomainSeparator, '.') ?? null;
  const error = output?.toLowerCase()?.includes('error processing tool');

  return (
    <Popover.Root>
      <div className="my-2.5 flex items-center gap-2.5">
        <div className="relative h-5 w-5 shrink-0">
          {progress < 1 ? (
            <InProgressCall progress={progress} isSubmitting={isSubmitting} error={error}>
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
            </InProgressCall>
          ) : error ? (
            <CancelledIcon />
          ) : (
            <FinishedIcon />
          )}
        </div>
        <ProgressText
          progress={progress}
          onClick={() => ({})}
          inProgressText={localize('com_assistants_running_action')}
          finishedText={
            domain && domain.length !== Constants.ENCODED_DOMAIN_LENGTH
              ? localize('com_assistants_completed_action', domain)
              : localize('com_assistants_completed_function', function_name)
          }
          hasInput={!!args?.length}
          popover={true}
        />
        {!!args?.length && (
          <ToolPopover input={args} output={output} domain={domain} function_name={function_name} />
        )}
      </div>
    </Popover.Root>
  );
}
