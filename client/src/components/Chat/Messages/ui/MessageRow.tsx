import type { ReactNode } from 'react';
import MessageTimestamp from './MessageTimestamp';
import { cn } from '~/utils';

type MessageRowProps = {
  id?: string;
  label: string;
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
  className?: string;
};

export default function MessageRow({
  id,
  icon,
  label,
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
}: MessageRowProps) {
  const showAssistantHeader = !isCreatedByUser && !hasParallelContent;
  let widthClass = 'w-full max-w-3xl';
  if (fullWidth) {
    widthClass = 'w-full max-w-full';
  } else if (hasParallelContent) {
    widthClass = 'w-full md:max-w-[58rem] xl:max-w-[70rem]';
  }

  return (
    <div
      id={id}
      role="group"
      aria-label={ariaLabel}
      className={cn(
        'message-render group mx-auto flex min-w-0 flex-1 font-theme-ui transition-[max-width] duration-theme-normal motion-reduce:transition-none',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-primary',
        isCreatedByUser ? 'justify-end' : 'items-start gap-3',
        widthClass,
        className,
      )}
    >
      {showAssistantHeader && (
        <div
          className="relative flex flex-shrink-0 flex-col items-center pt-0.5"
          aria-hidden="true"
        >
          <div className="flex size-6 items-center justify-center overflow-hidden rounded-full">
            {icon}
          </div>
        </div>
      )}

      <div
        className={cn(
          'relative flex min-w-0 flex-col',
          isCreatedByUser ? 'user-turn' : 'agent-turn',
          (hasParallelContent || isEditing) && 'w-full',
          !hasParallelContent &&
            isCreatedByUser &&
            cn('ml-auto items-end', !isEditing && 'w-fit max-w-[90%] sm:max-w-[85%]'),
          !hasParallelContent && !isCreatedByUser && !isEditing && 'flex-1',
        )}
      >
        {!hasParallelContent &&
          (isCreatedByUser ? (
            <h2 className="sr-only">
              {headerPrefix}
              {label}
              <MessageTimestamp value={timestamp} />
            </h2>
          ) : (
            <h2 className="flex min-h-7 select-none items-center text-sm font-semibold text-text-primary">
              <span className="sr-only">{headerPrefix}</span>
              {label}
              <MessageTimestamp value={timestamp} />
            </h2>
          ))}

        <div className={cn('flex w-full flex-col gap-1', isCreatedByUser && 'items-end')}>
          <div
            className={cn(
              'flex min-h-[20px] max-w-full flex-grow flex-col gap-0',
              isCreatedByUser && !isEditing
                ? 'w-fit rounded-theme-surface rounded-br-theme-control bg-surface-tertiary px-theme-normal py-2.5'
                : 'w-full',
            )}
            data-testid="message-body"
          >
            {children}
          </div>
          <div className={cn('w-full', isCreatedByUser && 'flex justify-end')}>{footer}</div>
        </div>
      </div>
    </div>
  );
}
