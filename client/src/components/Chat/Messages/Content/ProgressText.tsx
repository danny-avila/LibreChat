import { ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import * as Popover from '@radix-ui/react-popover';
import { Button, disclosureChevronVariants } from '@librechat/client';
import { isReportableRunStepDuration } from 'librechat-data-provider';
import type { ToolCallPhase } from '~/utils/toolCallPhase';
import { cn, getRunStepDurationLabels } from '~/utils';
import CancelledIcon from './CancelledIcon';
import { ROW_GLYPH_SLOT } from './rows';
import { useLocalize } from '~/hooks';

const wrapperClass =
  'progress-text-wrapper text-token-text-secondary relative -mt-[0.75px] h-5 w-full leading-5';

/** `right-0` and `max-w-full` cap the absolutely-positioned line at the message
 *  column; the label span truncates itself, so overflow stays visible for the
 *  button's focus ring. */
const contentClass =
  'progress-text-content absolute left-0 right-0 top-0 max-w-full overflow-visible whitespace-nowrap';

/** A failed row is marked at its left edge, in the rail's column when the row
 *  sits under a header and in the gutter when it stands alone, so a failure
 *  is findable by shape before its text is read. A pseudo-element rather than
 *  a border: the row's content is absolutely positioned against the padding
 *  box, so a border would push it and change the row's geometry. */
const failedStripeClass =
  "before:absolute before:-left-3 before:top-0 before:h-full before:w-0.5 before:rounded-full before:bg-status-error before:content-['']";

const Wrapper = ({
  popover,
  failed,
  children,
}: {
  popover: boolean;
  failed: boolean;
  children: React.ReactNode;
}) => {
  if (popover) {
    return (
      <div className={cn(wrapperClass, failed && failedStripeClass)}>
        <Popover.Trigger asChild>
          <div className={contentClass} style={{ opacity: 1, transform: 'none' }}>
            {children}
          </div>
        </Popover.Trigger>
      </div>
    );
  }

  return (
    <div className={cn(wrapperClass, failed && failedStripeClass)}>
      <div className={contentClass} style={{ opacity: 1, transform: 'none' }}>
        {children}
      </div>
    </div>
  );
};

export default function ProgressText({
  phase,
  onClick,
  inProgressText,
  finishedText,
  authText,
  icon: iconProp,
  subtitle,
  durationMs,
  hasInput = true,
  popover = false,
  isExpanded = false,
}: {
  /**
   * The card's settled state, resolved once by the caller via
   * `resolveToolCallPhase`. Replaces the former `error` + `errorSuffix`
   * pair, which encoded three terminal states in two booleans — `error`
   * meant cancelled, a present `errorSuffix` meant failed, and every
   * consumer had to reconstruct the distinction. That shape is what let a
   * duration render beside "failed" and a live region announce "completed"
   * over a visibly failed card.
   */
  phase: ToolCallPhase;
  onClick?: () => void;
  inProgressText: string;
  finishedText: string;
  authText?: string;
  icon?: React.ReactNode;
  subtitle?: string;
  /** Wall-clock duration of the run step, from `PartMetadata.runStepDurationMs`. */
  durationMs?: number;
  hasInput?: boolean;
  popover?: boolean;
  isExpanded?: boolean;
}) {
  const localize = useLocalize();
  /** For locale-aware decimal formatting of the sub-10s duration value. */
  const { i18n } = useTranslation();
  const isRunning = phase === 'running';

  /** Every branch below reads `phase`, so the label, the icon, the shimmer,
   *  the failure suffix and the duration cannot disagree about what state
   *  the card is in. */
  const text = isRunning ? (authText ?? inProgressText) : finishedText;
  const icon = phase === 'cancelled' ? <CancelledIcon /> : (iconProp ?? null);
  const showShimmer = isRunning;
  const errorSuffix = phase === 'failed' ? localize('com_ui_tool_failed') : undefined;
  /**
   * Shown only on a settled, successful card. While the step is still running
   * the number would be stale the instant it rendered, and on a cancelled or
   * failed card "how long it took" is not the fact the reader needs — that
   * slot already carries the cancelled icon or the failure suffix.
   */
  const duration =
    phase === 'completed' && isReportableRunStepDuration(durationMs)
      ? getRunStepDurationLabels(durationMs, i18n.language)
      : undefined;

  return (
    <Wrapper popover={popover} failed={phase === 'failed'}>
      <Button
        type="button"
        variant="ghost"
        className={cn(
          'group/disclosure inline-flex h-auto w-full items-center justify-start gap-2 rounded-none p-0 hover:bg-transparent hover:text-inherit disabled:opacity-100',
          hasInput
            ? 'focus-visible:ring-border-heavy focus-visible:ring-offset-0'
            : 'pointer-events-none',
        )}
        disabled={!hasInput}
        tabIndex={hasInput ? 0 : -1}
        onClick={hasInput ? onClick : undefined}
        aria-expanded={hasInput ? isExpanded : undefined}
      >
        {icon != null && (
          <span className={ROW_GLYPH_SLOT} aria-hidden="true">
            {icon}
          </span>
        )}
        {/* The label names the card and stays whole; a subtitle can be
            arbitrary authored text (a question, an error line), so it takes
            ALL of the shrink and ellipsizes instead of pushing the line past
            the message column. All, not most: a weighted share left the label
            a fraction of a pixel short of its text, and that fraction is
            enough for `truncate` to swap its last letters for an ellipsis.
            `max-w-full` keeps a label wider than the row from overflowing it
            now that nothing else can shrink the label. */}
        <span
          className={cn(
            showShimmer ? 'shimmer' : '',
            'min-w-0 max-w-full truncate font-medium',
            subtitle && 'shrink-0',
          )}
        >
          {text}
        </span>
        {subtitle && (
          <span className="min-w-0 shrink truncate font-normal text-text-secondary">
            {subtitle}
          </span>
        )}
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
              disclosureChevronVariants({ expanded: isExpanded }),
              'size-4 translate-y-[1px]',
            )}
            aria-hidden="true"
          />
        )}
      </Button>
    </Wrapper>
  );
}
