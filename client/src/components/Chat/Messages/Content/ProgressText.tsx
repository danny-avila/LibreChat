import * as Popover from '@radix-ui/react-popover';
import { cn } from '~/utils';

const Wrapper = ({ popover, children }: { popover: boolean; children: React.ReactNode }) => {
  if (popover) {
    return (
      <div className="text-token-text-secondary relative -mt-[0.75px] h-5 w-full leading-5">
        <Popover.Trigger asChild>
          <div
            className="absolute left-0 top-0 line-clamp-1 overflow-visible"
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
    <div className="text-token-text-secondary relative -mt-[0.75px] h-5 w-full leading-5">
      <div
        className="absolute left-0 top-0 line-clamp-1 overflow-visible"
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
  hasInput = true,
  popover = false,
}: {
  progress: number;
  onClick: () => void;
  inProgressText: string;
  finishedText: string;
  hasInput?: boolean;
  popover?: boolean;
}) {
  return (
    <Wrapper popover={popover}>
      <button
        type="button"
        className={cn('inline-flex items-center gap-1', hasInput ? '' : 'pointer-events-none')}
        disabled={!hasInput}
        onClick={onClick}
      >
        {progress < 1 ? inProgressText : finishedText}
        <svg width="16" height="17" viewBox="0 0 16 17" fill="none">
          <path
            className={hasInput ? '' : 'stroke-transparent'}
            d="M11.3346 7.83203L8.00131 11.1654L4.66797 7.83203"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </Wrapper>
  );
}
