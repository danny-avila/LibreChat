import { useEffect } from 'react';
import { Checkbox, useStoreState, useCheckboxStore } from '@ariakit/react';
import { cn } from '~/utils';
import * as React from 'react';

const CheckboxButton = React.forwardRef<
  HTMLInputElement,
  {
    icon?: React.ReactNode;
    label: string;
    className?: string;
    defaultChecked?: boolean;
    isCheckedClassName?: string;
    setValue?: (e: React.ChangeEvent<HTMLInputElement>, isChecked: boolean) => void;
  }
>(({ icon, label, setValue, className, defaultChecked, isCheckedClassName }, ref) => {
  const checkbox = useCheckboxStore();
  const isChecked = useStoreState(checkbox, (state) => state?.value);
  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (typeof isChecked !== 'boolean') {
      return;
    }
    setValue?.(e, !isChecked);
  };
  useEffect(() => {
    if (defaultChecked) {
      checkbox.setValue(defaultChecked);
    }
  }, [defaultChecked, checkbox]);

  return (
    <Checkbox
      ref={ref}
      store={checkbox}
      onChange={onChange}
      defaultChecked={defaultChecked}
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
      {icon && <span className="icon-md text-text-primary">{icon}</span>}

      {/* Show the label on larger screens */}
      <span className="hidden truncate md:block">{label}</span>
    </Checkbox>
  );
});

CheckboxButton.displayName = 'CheckboxButton';

export default CheckboxButton;
