import * as Popover from '@radix-ui/react-popover';
import { ChevronDown, ChevronUp } from 'lucide-react';
import CancelledIcon from './CancelledIcon';
import FinishedIcon from './FinishedIcon';
import { Spinner } from '~/components';
import { cn } from '~/utils';

const wrapperClass =
  'progress-text-wrapper text-token-text-secondary relative -mt-[0.75px] h-5 w-full leading-5';

const Wrapper = ({ popover, children }: { popover: boolean; children: React.ReactNode }) => {
  if (popover) {
    return (
      <div className={wrapperClass}>
        <Popover.Trigger asChild>
          <div
            className="progress-text-content absolute left-0 top-0 overflow-visible whitespace-nowrap"
            style={{ opacity: 1, transform: 'none' }}
            data-projection-id="78"
          >
            {children}
          </div>
        </Popover.Trigger>
      </div>
    );
  }

  return (
    <div className={wrapperClass}>
      <div
        className="progress-text-content absolute left-0 top-0 overflow-visible whitespace-nowrap"
        style={{ opacity: 1, transform: 'none' }}
        data-projection-id="78"
      >
        {children}
      </div>
    </div>
  );
};

export default function ProgressText({
  progress,
  onClick,
  inProgressText,
  finishedText,
  authText,
  hasInput = true,
  popover = false,
  isExpanded = false,
  error = false,
}: {
  progress: number;
  onClick?: () => void;
  inProgressText: string;
  finishedText: string;
  authText?: string;
  hasInput?: boolean;
  popover?: boolean;
  isExpanded?: boolean;
  error?: boolean;
}) {
  const text = progress < 1 ? (authText ?? inProgressText) : finishedText;
  return (
    <Wrapper popover={popover}>
      <button
        type="button"
        className={cn(
          'inline-flex w-full items-center gap-2',
          hasInput ? '' : 'pointer-events-none',
        )}
        disabled={!hasInput}
        onClick={hasInput ? onClick : undefined}
      >
        {progress < 1 ? <Spinner /> : error ? <CancelledIcon /> : <FinishedIcon />}
        <span className={`${progress < 1 ? 'shimmer' : ''}`}>{text}</span>
        {hasInput &&
          (isExpanded ? (
            <ChevronUp className="size-4 translate-y-[1px]" />
          ) : (
            <ChevronDown className="size-4 translate-y-[1px]" />
          ))}
      </button>
    </Wrapper>
  );
}
