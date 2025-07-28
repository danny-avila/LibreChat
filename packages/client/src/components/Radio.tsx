import React, { useState, useRef, useLayoutEffect, useCallback, memo } from 'react';
import { useLocalize } from '~/hooks';

interface Option {
  value: string;
  label: string;
}

interface RadioProps {
  options: Option[];
  value?: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
}

const Radio = memo(function Radio({ options, value, onChange, disabled = false }: RadioProps) {
  const localize = useLocalize();
  const [currentValue, setCurrentValue] = useState<string>(value ?? '');
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [backgroundStyle, setBackgroundStyle] = useState<React.CSSProperties>({});

  const handleChange = (newValue: string) => {
    setCurrentValue(newValue);
    onChange?.(newValue);
  };

  const updateBackgroundStyle = useCallback(() => {
    const selectedIndex = options.findIndex((opt) => opt.value === currentValue);
    if (selectedIndex >= 0 && buttonRefs.current[selectedIndex]) {
      const selectedButton = buttonRefs.current[selectedIndex];
      const container = selectedButton?.parentElement;
      if (selectedButton && container) {
        const containerRect = container.getBoundingClientRect();
        const buttonRect = selectedButton.getBoundingClientRect();
        const offsetLeft = buttonRect.left - containerRect.left - 4;
        setBackgroundStyle({
          width: `${buttonRect.width}px`,
          transform: `translateX(${offsetLeft}px)`,
        });
      }
    }
  }, [currentValue, options]);

  useLayoutEffect(() => {
    updateBackgroundStyle();
  }, [updateBackgroundStyle]);

  useLayoutEffect(() => {
    if (value !== undefined) {
      setCurrentValue(value);
    }
  }, [value]);

  if (options.length === 0) {
    return (
      <div
        className="relative inline-flex items-center rounded-lg bg-muted p-1 opacity-50"
        role="radiogroup"
      >
        <span className="px-4 py-2 text-xs text-muted-foreground">
          {localize('com_ui_no_options')}
        </span>
      </div>
    );
  }

  const selectedIndex = options.findIndex((opt) => opt.value === currentValue);

  return (
    <div className="relative inline-flex items-center rounded-lg bg-muted p-1" role="radiogroup">
      {selectedIndex >= 0 && (
        <div
          className="pointer-events-none absolute inset-y-1 rounded-md border border-border/50 bg-background shadow-sm transition-all duration-300 ease-out"
          style={backgroundStyle}
        />
      )}
      {options.map((option, index) => (
        <button
          key={option.value}
          ref={(el) => {
            buttonRefs.current[index] = el;
          }}
          type="button"
          role="radio"
          aria-checked={currentValue === option.value}
          onClick={() => handleChange(option.value)}
          disabled={disabled}
          className={`relative z-10 flex h-[34px] items-center justify-center rounded-md px-4 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            currentValue === option.value ? 'text-foreground' : 'text-foreground'
          } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
        >
          <span className="whitespace-nowrap">{option.label}</span>
        </button>
      ))}
    </div>
  );
});

export default Radio;
