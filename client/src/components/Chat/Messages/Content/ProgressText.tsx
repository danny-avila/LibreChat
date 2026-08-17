import { ChevronDown } from 'lucide-react';
import { Button } from '@librechat/client';
import { useTranslation } from 'react-i18next';
import * as Popover from '@radix-ui/react-popover';
import { isReportableRunStepDuration } from 'librechat-data-provider';
import { cn, getRunStepDurationLabels } from '~/utils';
import CancelledIcon from './CancelledIcon';
import { useLocalize } from '~/hooks';

const wrapperClass =
  'progress-text-wrapper text-token-text-secondary relative -mt-[0.75px] h-5 w-full leading-5';

/** `max-w-full` caps the absolutely-positioned line at the message column;
 *  the label span truncates itself, so overflow stays visible for the
 *  button's focus ring. */
const contentClass =
  'progress-text-content absolute left-0 top-0 max-w-full overflow-visible whitespace-nowrap';

const Wrapper = ({ popover, children }: { popover: boolean; children: React.ReactNode }) => {
  if (popover) {
    return (
      <div className={wrapperClass}>
        <Popover.Trigger asChild>
          <div className={contentClass} style={{ opacity: 1, transform: 'none' }}>
            {children}
          </div>
        </Popover.Trigger>
      </div>
    );
  }

  return (
    <div className={wrapperClass}>
      <div className={contentClass} style={{ opacity: 1, transform: 'none' }}>
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
  durationMs,
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
  /** Wall-clock duration of the run step, from `PartMetadata.runStepDurationMs`. */
  durationMs?: number;
  hasInput?: boolean;
  popover?: boolean;
  isExpanded?: boolean;
  error?: boolean;
}) {
  const localize = useLocalize();
  /** For locale-aware decimal formatting of the sub-10s duration value. */
  const { i18n } = useTranslation();
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
  /**
   * Shown only on a settled, successful card. While the step is still running
   * the number would be stale the instant it rendered, and on a cancelled or
   * failed card "how long it took" is not the fact the reader needs — that
   * slot already carries the cancelled icon or the error suffix.
   *
   * Both terminal-failure channels must be checked: at every call site
   * `error` carries cancellation while failure arrives as `errorSuffix`
   * alone, so gating on `error` by itself would print a duration beside
   * "failed". Gating here on the component's own props rather than on a
   * separate caller-supplied flag keeps this consistent with the label
   * beside it by construction; the callers only forward the number.
   */
  const duration =
    progress >= 1 && !error && !errorSuffix && isReportableRunStepDuration(durationMs)
      ? getRunStepDurationLabels(durationMs, i18n.language)
      : undefined;

  return (
    <Wrapper popover={popover}>
      <Button
        type="button"
        variant="ghost"
        className={cn(
          'h-auto w-full justify-start gap-2 rounded-none p-0 hover:bg-transparent hover:text-inherit disabled:opacity-100',
          hasInput
            ? 'focus-visible:ring-border-heavy focus-visible:ring-offset-0'
            : 'pointer-events-none',
        )}
        disabled={!hasInput}
        tabIndex={hasInput ? 0 : -1}
        onClick={hasInput ? onClick : undefined}
        aria-expanded={hasInput ? isExpanded : undefined}
      >
        {icon}
        <span className={cn(showShimmer ? 'shimmer' : '', 'min-w-0 truncate font-medium')}>
          {text}
        </span>
        {subtitle && <span className="font-normal text-text-secondary">{subtitle}</span>}
        {errorSuffix && <span className="font-normal text-status-error">· {errorSuffix}</span>}
        {duration && (
          <>
            {/* The compact form is the readable one on screen but a poor
                thing to hear ("one point four s"), so it is hidden from
                assistive technology and paired with a spoken equivalent.
                Both live inside the button, so its accessible name carries
                the duration — this is not an `aria-live` region and does not
                re-announce. */}
            <span className="font-normal text-text-secondary" aria-hidden="true">
              · {localize(duration.key, duration.values)}
            </span>
            <span className="sr-only">
              {localize(duration.announcedKey, duration.announcedValues)}
            </span>
          </>
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
      </Button>
    </Wrapper>
  );
}
