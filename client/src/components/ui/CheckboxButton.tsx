import { useEffect } from 'react';
import { Checkbox, useStoreState, useCheckboxStore } from '@ariakit/react';
import { cn } from '~/utils';

export default function CheckboxButton({
  label,
  icon,
  setValue,
  className,
  defaultChecked,
  isCheckedClassName,
}: {
  label: string;
  className?: string;
  icon?: React.ReactNode;
  defaultChecked?: boolean;
  isCheckedClassName?: string;
  setValue?: (isChecked: boolean) => void;
}) {
  const checkbox = useCheckboxStore();
  const isChecked = useStoreState(checkbox, (state) => state?.value);
  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (typeof isChecked !== 'boolean') {
      return;
    }
    setValue?.(!isChecked);
  };
  useEffect(() => {
    if (defaultChecked) {
      checkbox.setValue(defaultChecked);
    }
  }, [defaultChecked, checkbox]);

  return (
    <Checkbox
      store={checkbox}
      onChange={onChange}
      defaultChecked={defaultChecked}
      className={cn(
        // Base styling from MultiSelect's selectClassName
        'group relative inline-flex items-center justify-center gap-1.5',
        'rounded-full border border-border-medium text-sm font-medium',
        'size-9 p-2 transition-shadow md:w-full md:p-3',
        'bg-surface-chat shadow-sm hover:bg-surface-hover hover:shadow-md active:shadow-inner',

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
}
