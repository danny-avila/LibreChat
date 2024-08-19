import React from 'react';
import * as Ariakit from '@ariakit/react';
import type { OptionWithIcon } from '~/common';
import { cn } from '~/utils';

type ComboboxProps = {
  label?: string;
  placeholder?: string;
  options: OptionWithIcon[] | string[];
  className?: string;
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
};

export const SimpleCombobox: React.FC<ComboboxProps> = ({
  label,
  placeholder = 'Select an option',
  options,
  className,
  value,
  onChange,
  onBlur,
}) => {
  const isOptionObject = (option: unknown): option is OptionWithIcon => {
    return option != null && typeof option === 'object' && 'value' in option;
  };

  const [inputValue, setInputValue] = React.useState(value);

  React.useEffect(() => {
    setInputValue(value);
  }, [value]);

  const handleChange = (newValue: string) => {
    setInputValue(newValue);
    onChange(newValue);
  };

  return (
    <Ariakit.ComboboxProvider value={inputValue} setValue={handleChange}>
      {label != null && (
        <Ariakit.ComboboxLabel
          className={cn('mb-2 block text-sm font-medium text-text-primary', className)}
        >
          {label}
        </Ariakit.ComboboxLabel>
      )}
      <Ariakit.Combobox
        placeholder={placeholder}
        className={cn(
          'h-10 w-full rounded-md border border-border-medium bg-surface-primary px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring-primary',
          'placeholder-text-secondary',
          'hover:bg-surface-hover',
          className,
        )}
        onChange={(event) => handleChange(event.target.value)}
        onBlur={onBlur}
      />
      <Ariakit.ComboboxPopover
        gutter={4}
        sameWidth
        className={cn(
          'z-50 max-h-60 w-full overflow-auto rounded-md bg-surface-primary p-1 shadow-lg',
          'ring-1 ring-ring-primary ring-opacity-5 focus:outline-none',
          'animate-in fade-in-0 zoom-in-95',
          'dark:bg-surface-primary dark:ring-opacity-10',
        )}
      >
        {options.map((option: string | OptionWithIcon, index: number) => (
          <Ariakit.ComboboxItem
            key={index}
            className={cn(
              'relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none',
              'hover:bg-surface-hover hover:text-text-primary',
              'data-[active-item]:bg-surface-active data-[active-item]:text-text-primary',
            )}
            value={isOptionObject(option) ? `${option.value ?? ''}` : option}
          >
            {isOptionObject(option) && option.icon != null && (
              <span className="mr-2 flex-shrink-0">{option.icon}</span>
            )}
            {isOptionObject(option) ? option.label : option}
          </Ariakit.ComboboxItem>
        ))}
      </Ariakit.ComboboxPopover>
    </Ariakit.ComboboxProvider>
  );
};
