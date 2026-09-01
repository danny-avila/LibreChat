import type { ReactNode } from 'react';
import MessageTimestamp from './MessageTimestamp';
import HeaderLabel from './HeaderLabel';
import { cn } from '~/utils';

type MessageRowProps = {
  id?: string;
  label: string;
  hoverLabel?: string | null;
  icon: ReactNode;
  children: ReactNode;
  footer: ReactNode;
  timestamp?: string | null;
  ariaLabel?: string;
  headerPrefix?: string;
  isCreatedByUser: boolean;
  hasParallelContent?: boolean;
  fullWidth?: boolean;
  isEditing?: boolean;
  /** Full-width block without the author header or user bubble — for rows
   *  whose body carries its own header (e.g. wake-up task cards). */
  plain?: boolean;
  className?: string;
};

export function getMessageRowWidthClass({
  fullWidth = false,
  hasParallelContent = false,
}: {
  fullWidth?: boolean;
  hasParallelContent?: boolean;
} = {}) {
  if (fullWidth) return 'w-full max-w-full sm:px-2';
  if (hasParallelContent) return 'w-full sm:px-2 md:max-w-[58rem] xl:max-w-[70rem]';
  return 'w-full sm:px-2 md:max-w-3xl xl:max-w-4xl';
}

export default function MessageRow({
  id,
  icon,
  label,
  hoverLabel,
  footer,
  children,
  timestamp,
  ariaLabel,
  className,
  headerPrefix,
  isCreatedByUser,
  hasParallelContent = false,
  fullWidth = false,
  isEditing = false,
  plain = false,
}: MessageRowProps) {
  // Same column as ChatForm: max-width plus `sm:px-2`, so the body lines
  // up with the composer surface rather than the form's outer box.
  const widthClass = getMessageRowWidthClass({ fullWidth, hasParallelContent });

  return (
    <div
      id={id}
      role="group"
      aria-label={ariaLabel}
      className={cn(
        'message-render group mx-auto flex min-w-0 flex-1 font-theme-ui transition-[max-width] duration-theme-normal motion-reduce:transition-none',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-primary',
        isCreatedByUser && !plain ? 'justify-end' : 'items-start',
        widthClass,
        className,
      )}
    >
      <div
        className={cn(
          'relative flex min-w-0 flex-col',
          isCreatedByUser ? 'user-turn' : 'agent-turn',
          (hasParallelContent || isEditing || plain) && 'w-full',
          !hasParallelContent &&
            !plain &&
            isCreatedByUser &&
            cn('ml-auto items-end', !isEditing && 'w-fit max-w-[90%] sm:max-w-[85%]'),
          !hasParallelContent && !isCreatedByUser && !isEditing && 'flex-1',
        )}
      >
        {!hasParallelContent &&
          !plain &&
          (isCreatedByUser ? (
            <h2 className="sr-only">
              {headerPrefix}
              {label}
              <MessageTimestamp value={timestamp} />
            </h2>
          ) : (
            /** `mb-1` keeps the name off its own first line of body text. */
            <h2 className="mb-1 flex min-h-7 w-full select-none items-center gap-2 text-sm font-semibold text-text-primary">
              <span
                aria-hidden="true"
                className="flex size-6 flex-shrink-0 items-center justify-center overflow-hidden rounded-full"
              >
                {icon}
              </span>
              <span className="sr-only">{headerPrefix}</span>
              <HeaderLabel label={label} hoverLabel={hoverLabel} />
              <MessageTimestamp value={timestamp} className="ml-auto shrink-0 font-normal" />
            </h2>
          ))}

        <div className={cn('flex w-full flex-col gap-1', isCreatedByUser && !plain && 'items-end')}>
          <div
            className={cn(
              'flex min-h-[20px] max-w-full flex-grow flex-col gap-0',
              isCreatedByUser && !isEditing && !plain
                ? 'w-fit rounded-theme-surface rounded-br-theme-control bg-surface-tertiary px-theme-normal py-2.5'
                : 'w-full',
            )}
            data-testid="message-body"
          >
            {children}
          </div>
          <div className={cn('w-full', isCreatedByUser && !plain && 'flex justify-end')}>
            {footer}
          </div>
        </div>
      </div>
    </div>
  );
}
