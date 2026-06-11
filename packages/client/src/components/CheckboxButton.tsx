import * as React from 'react';
import { useEffect } from 'react';
import { X } from 'lucide-react';
import { Checkbox, useStoreState, useCheckboxStore } from '@ariakit/react';
import { cn } from '~/utils';

const CheckboxButton: React.ForwardRefExoticComponent<
  {
    icon?: React.ReactNode;
    label: string;
    className?: string;
    checked?: boolean;
    defaultChecked?: boolean;
    isCheckedClassName?: string;
    isPinned?: boolean;
    onDismiss?: () => void;
    setValue?: (values: {
      e?: React.ChangeEvent<HTMLInputElement>;
      value: boolean | string;
    }) => void;
  } & React.RefAttributes<HTMLInputElement>
> = React.forwardRef<
  HTMLInputElement,
  {
    icon?: React.ReactNode;
    label: string;
    className?: string;
    checked?: boolean;
    defaultChecked?: boolean;
    isCheckedClassName?: string;
    isPinned?: boolean;
    onDismiss?: () => void;
    setValue?: (values: {
      e?: React.ChangeEvent<HTMLInputElement>;
      value: boolean | string;
    }) => void;
  }
>(({ icon, label, setValue, className, checked, defaultChecked, isCheckedClassName, isPinned, onDismiss }, ref) => {
  const checkbox = useCheckboxStore();
  const isChecked = useStoreState(checkbox, (state) => state?.value);
  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (typeof isChecked !== 'boolean') {
      return;
    }
    setValue?.({ e, value: !isChecked });
  };

  // Sync with controlled checked prop
  useEffect(() => {
    if (checked !== undefined) {
      checkbox.setValue(checked);
    }
  }, [checked, checkbox]);

  // Set initial value from defaultChecked
  useEffect(() => {
    if (defaultChecked !== undefined && checked === undefined) {
      checkbox.setValue(defaultChecked);
    }
  }, [defaultChecked, checked, checkbox]);

  if (checked && onDismiss) {
    return (
      <div
        className={cn(
          'inline-flex items-center gap-1 rounded-full border border-border-medium',
          'py-0.5 pl-2.5 pr-1.5 text-xs font-medium text-text-primary',
          'transition-colors',
          isCheckedClassName,
          className,
        )}
      >
        {icon && (
          <span className="flex shrink-0 items-center">{icon as React.JSX.Element}</span>
        )}
        <span className="truncate">{label}</span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDismiss();
          }}
          className="ml-0.5 flex shrink-0 items-center rounded-full p-0.5 opacity-60 transition-opacity hover:opacity-100"
          aria-label={`Dismiss ${label}`}
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    );
  }

  if (isPinned && !checked) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setValue?.({ value: true });
        }}
        className={cn(
          'inline-flex cursor-pointer items-center gap-1 rounded-full border border-border-light',
          'py-0.5 px-2.5 text-xs font-medium text-text-secondary',
          'bg-transparent opacity-60 transition-all hover:opacity-90 hover:bg-surface-hover',
          className,
        )}
        aria-label={label}
      >
        {icon && (
          <span className="flex shrink-0 items-center">{icon as React.JSX.Element}</span>
        )}
        <span className="truncate">{label}</span>
      </button>
    );
  }

  return (
    <Checkbox
      ref={ref}
      store={checkbox}
      onChange={onChange}
      className={cn(
        // Base styling from MultiSelect's selectClassName
        'group relative inline-flex items-center justify-center gap-1.5',
        'rounded-full border border-border-medium text-sm font-medium',
        'size-9 p-2 transition-all md:w-full md:p-3',
        'bg-transparent shadow-sm hover:bg-surface-hover hover:shadow-md active:shadow-inner',

        // Checked state styling
        isChecked && isCheckedClassName && isCheckedClassName,

        // Additional custom classes
        className,
      )}
      render={<button type="button" aria-label={label} />}
    >
      {/* Icon if provided */}
      {icon && <span className="icon-md text-text-primary">{icon as React.JSX.Element}</span>}

      {/* Show the label on larger screens */}
      <span className="hidden truncate md:block">{label}</span>
    </Checkbox>
  );
});

CheckboxButton.displayName = 'CheckboxButton';

export default CheckboxButton;
