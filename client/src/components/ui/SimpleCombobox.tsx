import React from 'react';
import * as Ariakit from '@ariakit/react';
import type { OptionWithIcon } from '~/common';
import { cn } from '~/utils';

type ComboboxProps = {
  label?: string;
  placeholder?: string;
  options: OptionWithIcon[] | string[];
  className?: string;
  labelClassName?: string;
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
};

export const SimpleCombobox: React.FC<ComboboxProps> = ({
  label,
  labelClassName,
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

  const [isOpen, setIsOpen] = React.useState(false);
  const [inputValue, setInputValue] = React.useState(value);
  const [isKeyboardFocus, setIsKeyboardFocus] = React.useState(false);

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
          className={cn('mb-2 block text-sm font-medium text-text-primary', labelClassName ?? '')}
        >
          {label}
        </Ariakit.ComboboxLabel>
      )}
      <div className={cn('relative', isKeyboardFocus ? 'rounded-md ring-2 ring-ring-primary' : '')}>
        <Ariakit.Combobox
          placeholder={placeholder}
          className={cn(
            'h-10 w-full rounded-md border border-border-light bg-surface-primary px-3 py-2 text-sm',
            'placeholder-text-secondary hover:bg-surface-hover',
            'focus:outline-none',
            className,
          )}
          onChange={(event) => handleChange(event.target.value)}
          onBlur={() => {
            setIsKeyboardFocus(false);
            onBlur();
          }}
          onFocusVisible={() => {
            setIsKeyboardFocus(true);
            setIsOpen(true);
          }}
          onMouseDown={() => {
            setIsKeyboardFocus(false);
          }}
        />
      </div>
      <Ariakit.ComboboxPopover
        gutter={4}
        sameWidth
        open={isOpen}
        onClose={() => setIsOpen(false)}
        className={cn(
          'z-50 max-h-60 w-full overflow-auto rounded-md bg-surface-primary p-1 shadow-lg',
          'animate-in fade-in-0 zoom-in-95',
        )}
      >
        {options.map((option: string | OptionWithIcon, index: number) => (
          <Ariakit.ComboboxItem
            key={index}
            className={cn(
              'relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none',
              'cursor-pointer hover:bg-surface-tertiary hover:text-text-primary',
              'data-[active-item]:bg-surface-tertiary data-[active-item]:text-text-primary',
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
