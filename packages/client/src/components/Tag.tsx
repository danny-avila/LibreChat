import * as React from 'react';
import { X } from 'lucide-react';
import { cn } from '~/utils';

type TagProps = React.ComponentPropsWithoutRef<'div'> & {
  label: string;
  labelClassName?: string;
  CancelButton?: React.ReactNode;
  LabelNode?: React.ReactNode;
  onRemove?: (e: React.MouseEvent<HTMLButtonElement>) => void;
};

const TagPrimitiveRoot = React.forwardRef<HTMLDivElement, TagProps>(
  (
    { CancelButton, LabelNode, label, onRemove, className = '', labelClassName = '', ...props },
    ref,
  ) => (
    <div
      ref={ref}
      {...props}
      className={cn(
        'flex max-h-8 items-center overflow-y-hidden rounded-3xl border-2 border-green-600 bg-green-600/20 text-xs text-green-600 dark:text-white',
        className,
      )}
    >
      <div className={cn('ml-1 whitespace-pre-wrap px-2 py-1', labelClassName)}>
        {LabelNode ? <>{LabelNode} </> : null}
        {label}
      </div>
      {CancelButton
        ? CancelButton
        : onRemove && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemove(e);
              }}
              className="rounded-full bg-green-600/50"
              aria-label={`Remove ${label}`}
            >
              <X className="m-[1.5px] p-1" />
            </button>
          )}
    </div>
  ),
);

TagPrimitiveRoot.displayName = 'Tag';

export const Tag = React.memo(TagPrimitiveRoot);
