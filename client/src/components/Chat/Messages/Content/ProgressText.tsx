import * as Popover from '@radix-ui/react-popover';
import { ChevronDown } from 'lucide-react';
import CancelledIcon from './CancelledIcon';
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
  icon: iconProp,
  subtitle,
  errorSuffix,
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
  icon?: React.ReactNode;
  subtitle?: string;
  errorSuffix?: string;
  hasInput?: boolean;
  popover?: boolean;
  isExpanded?: boolean;
  error?: boolean;
}) {
  const getText = () => {
    if (error) {
      return finishedText;
    }
    if (progress < 1) {
      return authText ?? inProgressText;
    }
    return finishedText;
  };

  const getIcon = () => {
    if (error && !errorSuffix) {
      return <CancelledIcon />;
    }
    return iconProp ?? null;
  };

  const text = getText();
  const icon = getIcon();
  const showShimmer = progress < 1 && !error;

  return (
    <Wrapper popover={popover}>
      <button
        type="button"
        className={cn(
          'inline-flex w-full items-center gap-2',
          hasInput
            ? 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-heavy'
            : 'pointer-events-none',
        )}
        disabled={!hasInput}
        onClick={hasInput ? onClick : undefined}
        aria-expanded={hasInput ? isExpanded : undefined}
      >
        {icon}
        <span className={cn(showShimmer ? 'shimmer' : '', 'font-medium')}>{text}</span>
        {subtitle && <span className="font-normal text-text-secondary">{subtitle}</span>}
        {errorSuffix && (
          <span className="font-normal text-red-600 dark:text-red-400">— {errorSuffix}</span>
        )}
        {hasInput && (
          <ChevronDown
            className={cn(
              'size-4 shrink-0 translate-y-[1px] transition-transform duration-200 ease-out',
              isExpanded && 'rotate-180',
            )}
            aria-hidden="true"
          />
        )}
      </button>
    </Wrapper>
  );
}
